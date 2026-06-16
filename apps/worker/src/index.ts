import { Hono } from 'hono';
import { cors } from 'hono/cors';
import admin from './routes/admin';
import media from './routes/media';
import v1 from './routes/v1';
import { getSupabase } from './lib/supabase';
import { Env } from './types';

interface ScoringMessage {
  attemptId: string;
  recordingUrl: string;
  questionType: string;
  version: number;
}

async function scoreRecording(_recordingUrl: string, _questionType: string) {
  return {
    fluency: 75,
    pronunciation: 72,
    content: 80,
  };
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'https://pteprep.com.np'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'X-Admin-Key', 'Authorization'],
  }),
);

app.route('/admin', admin);
app.route('/media', media);
app.route('/v1', v1);

app.get('/', (c) => c.json({ service: 'pteprep-api', status: 'running' }));

export default {
  fetch: app.fetch.bind(app),
  async queue(batch: MessageBatch<ScoringMessage>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const { attemptId, recordingUrl, questionType } = message.body;
      const supabase = getSupabase(env);

      try {
        const score = await scoreRecording(recordingUrl, questionType);

        await supabase
          .from('practice_attempts')
          .update({ status: 'completed', score })
          .eq('id', attemptId);

        message.ack();
      } catch (err) {
        const errorDetail = err instanceof Error ? err.message : 'Unknown scoring error';

        await supabase
          .from('practice_attempts')
          .update({ status: 'failed', error_detail: errorDetail })
          .eq('id', attemptId);

        message.ack();
      }
    }
  },
};
