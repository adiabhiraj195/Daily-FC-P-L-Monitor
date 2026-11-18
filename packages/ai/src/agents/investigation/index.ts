import { MarginGraphState } from '../../state/index.js';
import { ModelProvider } from '../../providers/index.js';
import { INVESTIGATION_SYSTEM_PROMPT } from '../../prompts/index.js';
import { createLangSmithConfig } from '../../tracers/index.js';
import { buildInvestigationContext } from '../../context/builder.js';
import { extractTokenUsage } from '../../tokens/index.js';
import {
  investigationOutputSchema,
  DiagnosticStatus,
  InvestigationOutput,
  extractTextContent,
  parseAIOutput
} from '@prozo/shared';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function runInvestigationAgent(
  state: MarginGraphState,
  provider: ModelProvider
): Promise<Partial<MarginGraphState>> {
  console.log(
    `[InvestigationAgent] Preparing normalized payload for FC=${state.fcId}, Date=${state.businessDate}, Colour=${state.pnl.colour}, AnomaliesCount=${state.pnl.anomalies.length}, Completeness=${state.completeness || 'FINANCIAL_ONLY'}`
  );

  const model = provider.createModel({ temperature: 0.1 });

  // 1. Build compact normalized context and deterministic evidence registry
  const { context, evidenceRegistry, compactPayload } = buildInvestigationContext({
    fcId: state.fcId,
    businessDate: state.businessDate,
    pnl: state.pnl,
    operationsData: state.operationsData,
    laborData: state.laborData,
    derivedMetrics: state.derivedMetrics,
    historicalContext: state.historicalContext,
    completeness: state.completeness,
    diagnosticStatus: state.diagnosticStatus
  });

  const validAnomalyIds = new Set(context.anomalies.map(a => a.id));

  const promptText = `Please investigate this submission using available financial, operational, and workforce evidence:\n${JSON.stringify(compactPayload, null, 2)}`;
  const messages = [
    new SystemMessage(INVESTIGATION_SYSTEM_PROMPT),
    new HumanMessage(promptText)
  ];

  const langsmithConfig = createLangSmithConfig({
    runName: `InvestigationAgent:${state.fcId}:${state.businessDate}`,
    tags: ['investigation-agent', state.fcId, state.pnl.colour, state.completeness || 'FINANCIAL_ONLY'],
    metadata: {
      agent: 'InvestigationAgent',
      fcId: state.fcId,
      businessDate: state.businessDate,
      submissionId: state.submissionId,
      colour: state.pnl.colour,
      revenue: state.pnl.revenue,
      cm1Pct: state.pnl.cm1Pct,
      cm2Pct: state.pnl.cm2Pct,
      completeness: state.completeness || 'FINANCIAL_ONLY',
      anomalies: state.pnl.anomalies.map(a => a.metricKey),
      retryCount: state.retryCount
    }
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    console.log(`[InvestigationAgent] Sending compact prompt to LLM (${provider.name}) with LangSmith trace context...`);
    let response = await model.invoke(messages, langsmithConfig);
    let usage = extractTokenUsage(promptText, response);
    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;

    let textContent = extractTextContent(response.content);
    console.log(`[InvestigationAgent] Received response from LLM (${textContent.length} chars). Parsing JSON...`);

    // Helper to extract and parse JSON safely
    const parseOutput = (text: string) => {
      const parsed = parseAIOutput(text);
      if (!parsed) {
        throw new Error(`Failed to parse valid JSON from LLM output: ${text.slice(0, 150)}...`);
      }
      return parsed;
    };

    let parsed: any;
    try {
      parsed = parseOutput(textContent);
    } catch (parseErr: any) {
      console.warn(`[InvestigationAgent] Initial JSON parse failed. Retrying once with schema feedback...`);
      const retryMessages = [
        ...messages,
        response,
        new HumanMessage(`JSON Parse Error: ${parseErr.message}. Return strictly valid JSON matching the required schema.`)
      ];
      response = await model.invoke(retryMessages, langsmithConfig);
      usage = extractTokenUsage(promptText, response);
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      textContent = extractTextContent(response.content);
      parsed = parseOutput(textContent);
    }

    // Enforce max 5 significant findings
    if (Array.isArray(parsed.findings) && parsed.findings.length > 5) {
      console.log(`[InvestigationAgent] Findings count (${parsed.findings.length}) exceeded 5. Keeping top 5 significant findings.`);
      parsed.findings = parsed.findings.slice(0, 5);
    }

    // Validate findings against evidence registry
    let validation = evidenceRegistry.validateFindings(parsed.findings || [], validAnomalyIds);

    // If validation failed, retry with concise feedback once
    if (!validation.isValid) {
      console.warn(`[InvestigationAgent] Finding validation failed: ${validation.errors.join('; ')}. Retrying once with concise feedback...`);
      const feedbackMessages = [
        ...messages,
        response,
        new HumanMessage(
          `Validation feedback: The previous output failed evidence validation:\n${validation.errors.join('\n')}\n` +
          `Please correct evidence references (evidenceRefs must be valid IDs from evidenceRegistry, e.g. ["E1", "E4"]) and re-output valid JSON.`
        )
      ];
      try {
        const retryResponse = await model.invoke(feedbackMessages, langsmithConfig);
        const retryUsage = extractTokenUsage(promptText, retryResponse);
        totalInputTokens += retryUsage.inputTokens;
        totalOutputTokens += retryUsage.outputTokens;

        const retryText = extractTextContent(retryResponse.content);
        const retryParsed = parseOutput(retryText);

        if (Array.isArray(retryParsed.findings) && retryParsed.findings.length > 5) {
          retryParsed.findings = retryParsed.findings.slice(0, 5);
        }

        const retryValidation = evidenceRegistry.validateFindings(retryParsed.findings || [], validAnomalyIds);
        if (retryValidation.isValid) {
          parsed = retryParsed;
          validation = retryValidation;
          console.log(`[InvestigationAgent] Retry succeeded with valid evidence references.`);
        } else {
          console.warn(`[InvestigationAgent] Retry still had invalid evidence references: ${retryValidation.errors.join('; ')}`);
        }
      } catch (retryErr: any) {
        console.warn(`[InvestigationAgent] Retry execution failed: ${retryErr.message}`);
      }
    }

    // If still invalid, generate safe fallback with status VALIDATION_FAILED
    if (!validation.isValid) {
      console.warn(`[InvestigationAgent] Validation failed after retry. Generating deterministic safe fallback with VALIDATION_FAILED.`);
      const safeFindings = context.anomalies.map((a, idx) => ({
        findingId: `safe-${idx + 1}`,
        anomalyId: a.id,
        lineItem: a.metricKey,
        title: `${a.metricKey} Breach Analysis`,
        explanation: `Deterministic detection: ${a.metricKey} breached target boundary. Deviation: ${a.deviationFromTargetPP ?? 'N/A'}pp.`,
        classification: 'OBSERVED_FACT' as const,
        evidenceRefs: evidenceRegistry.getAll().slice(0, 2).map(e => e.id),
        evidence: [],
        confidence: 'HIGH' as const
      }));

      const safeOutput: InvestigationOutput = {
        summary: `Automated analysis identified ${context.anomalies.length} anomaly(ies). LLM evidence validation failed; safe deterministic findings generated.`,
        diagnosticStatus: 'VALIDATION_FAILED' as const,
        findings: safeFindings,
        dataGaps: ['LLM output failed evidence reference validation; managerial audit required.'],
        unresolvedQuestions: ['Validation failure requires system inspection.'],
        recurringIssue: false,
        possibleCauses: []
      };

      return {
        investigation: safeOutput,
        investigationContext: context,
        evidenceRegistry,
        tokenUsage: {
          investigationInputTokens: totalInputTokens,
          investigationOutputTokens: totalOutputTokens,
          recommendationInputTokens: 0,
          recommendationOutputTokens: 0,
          totalLLMTokenUsage: totalInputTokens + totalOutputTokens
        },
        errors: [...state.errors, `Investigation validation error: ${validation.errors.join('; ')}`]
      };
    }

    parsed.findings = validation.validatedFindings;
    const validated = investigationOutputSchema.parse(parsed);

    // Enforce diagnosticStatus based on actual evidence completeness
    const expectedDiagnosticStatus: DiagnosticStatus =
      state.completeness === 'COMPLETE'
        ? 'COMPLETE'
        : state.completeness === 'FINANCIAL_ONLY' ||
          state.completeness === 'PENDING_OPERATIONS' ||
          state.completeness === 'PENDING_LABOR'
          ? 'PARTIAL'
          : 'INSUFFICIENT_DATA';

    if (validated.diagnosticStatus !== expectedDiagnosticStatus) {
      validated.diagnosticStatus = expectedDiagnosticStatus;
    }

    // If operations or labor data is missing, ensure explicit disclosure in dataGaps
    if (!state.operationsData && !validated.dataGaps.some(g => g.toLowerCase().includes('operation'))) {
      validated.dataGaps.push('Daily_Operations dataset is unavailable for this business date; throughput and order volume evidence could not be verified.');
    }
    if (!state.laborData && !validated.dataGaps.some(g => g.toLowerCase().includes('labor') || g.toLowerCase().includes('labour'))) {
      validated.dataGaps.push('Daily_Labor dataset is unavailable for this business date; shift-level overtime, contractor hours, and attendance could not be verified.');
    }

    console.log(
      `[InvestigationAgent] Schema validated successfully! Findings: ${validated.findings.length}, Status: ${validated.diagnosticStatus}, DataGaps: ${validated.dataGaps.length}, Tokens: in=${totalInputTokens}, out=${totalOutputTokens}`
    );

    return {
      investigation: validated,
      investigationContext: context,
      evidenceRegistry,
      tokenUsage: {
        investigationInputTokens: totalInputTokens,
        investigationOutputTokens: totalOutputTokens,
        recommendationInputTokens: 0,
        recommendationOutputTokens: 0,
        totalLLMTokenUsage: totalInputTokens + totalOutputTokens
      },
      errors: []
    };
  } catch (err: any) {
    console.error(`[InvestigationAgent] Execution failed:`, err.message);
    return {
      errors: [...state.errors, `Investigation Agent Error: ${err.message}`]
    };
  }
}
