import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { uploadsRouter } from '../modules/uploads/uploads.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { fcRouter } from '../modules/fulfilment-centres/fc.routes.js';
import { anomaliesRouter } from '../modules/anomalies/anomalies.routes.js';
import { targetRulesRouter } from '../modules/target-rules/target-rules.routes.js';
import { submissionsRouter } from '../modules/submissions/submissions.routes.js';
import { adminJobsRouter } from '../modules/admin-jobs/admin-jobs.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/fcs', fcRouter);
apiRouter.use('/anomalies', anomaliesRouter);
apiRouter.use('/target-rules', targetRulesRouter);
apiRouter.use('/submissions', submissionsRouter);
apiRouter.use('/admin/jobs', adminJobsRouter);

