import { MarginGraphState } from '../../state/index.js';
import { ModelProvider } from '../../providers/index.js';
import { INVESTIGATION_SYSTEM_PROMPT } from '../../prompts/index.js';
import { createLangSmithConfig } from '../../tracers/index.js';
import { investigationOutputSchema } from '@prozo/shared';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function runInvestigationAgent(
  state: MarginGraphState,
  provider: ModelProvider
): Promise<Partial<MarginGraphState>> {
  console.log(`[InvestigationAgent] Preparing payload for FC=${state.fcId}, Date=${state.businessDate}, Colour=${state.pnl.colour}, AnomaliesCount=${state.pnl.anomalies.length}`);
  const model = provider.createModel({ temperature: 0.1 });

  const inputPayload = {
    fcId: state.fcId,
    businessDate: state.businessDate,
    financialFacts: {
      revenue: state.pnl.revenue,
      cm1: state.pnl.cm1,
      cm1Pct: state.pnl.cm1Pct,
      cm2: state.pnl.cm2,
      cm2Pct: state.pnl.cm2Pct,
      colour: state.pnl.colour,
      costLines: state.pnl.costLines
    },
    anomalies: state.pnl.anomalies,
    historicalContext: state.historicalContext
  };

  const messages = [
    new SystemMessage(INVESTIGATION_SYSTEM_PROMPT),
    new HumanMessage(`Please investigate this submission:\n${JSON.stringify(inputPayload, null, 2)}`)
  ];

  const langsmithConfig = createLangSmithConfig({
    runName: `InvestigationAgent:${state.fcId}:${state.businessDate}`,
    tags: ['investigation-agent', state.fcId, state.pnl.colour],
    metadata: {
      agent: 'InvestigationAgent',
      fcId: state.fcId,
      businessDate: state.businessDate,
      submissionId: state.submissionId,
      colour: state.pnl.colour,
      revenue: state.pnl.revenue,
      cm1Pct: state.pnl.cm1Pct,
      cm2Pct: state.pnl.cm2Pct,
      anomalies: state.pnl.anomalies.map(a => a.metricKey),
      retryCount: state.retryCount
    }
  });

  try {
    console.log(`[InvestigationAgent] Sending prompt to LLM (${provider.name}) with LangSmith trace context...`);
    const response = await model.invoke(messages, langsmithConfig);
    const textContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    console.log(`[InvestigationAgent] Received response from LLM (${textContent.length} chars). Parsing JSON...`);

    // Extract JSON block if wrapped in markdown
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const rawJson = jsonMatch ? jsonMatch[0] : textContent;
    const parsed = JSON.parse(rawJson);

    const validated = investigationOutputSchema.parse(parsed);
    console.log(`[InvestigationAgent] Schema validated successfully! Findings: ${validated.findings.length}, PossibleCauses: ${validated.possibleCauses.length}`);

    // Validate evidence references: make sure each evidenceRef exists
    const validMetrics = new Set([
      'REVENUE',
      'CM1',
      'CM1_ACTUAL_PCT',
      'CM2',
      'CM2_ACTUAL_PCT',
      'MANPOWER_COST_AMOUNT',
      'MANPOWER_COST_PCT',
      'PACKAGING_COST_AMOUNT',
      'PACKAGING_COST_PCT',
      'POWER_AND_FUEL_COST_AMOUNT',
      'POWER_AND_FUEL_COST_PCT',
      'FC_RENT_COST_AMOUNT',
      'FC_RENT_COST_PCT',
      'EQUIPMENT_RENTALS_COST_AMOUNT',
      'EQUIPMENT_RENTALS_COST_PCT',
      'OVERHEADS_COST_AMOUNT',
      'OVERHEADS_COST_PCT'
    ]);

    // Add cost line keys
    state.pnl.costLines.forEach(c => {
      validMetrics.add(c.lineItem);
      validMetrics.add(`${c.lineItem}_ACTUAL_PCT`);
      validMetrics.add(`${c.lineItem}_EXCESS`);
    });
    state.pnl.anomalies.forEach((a, i) => {
      validMetrics.add(`anomaly_${i}`);
      validMetrics.add(a.metricKey);
    });

    return {
      investigation: validated,
      errors: []
    };
  } catch (err: any) {
    console.error(`[InvestigationAgent] Execution failed:`, err.message);
    return {
      errors: [...state.errors, `Investigation Agent Error: ${err.message}`]
    };
  }
}
