import { buildFollowUpQuestion } from './buildFollowUpQuestion';

export async function fetchFollowUpQuestion({ opinion, visionLabel }) {
  try {
    const response = await fetch('/api/discussion-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opinion, visionLabel }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.question) {
        return { question: data.question, source: data.source || 'api' };
      }
    }
  } catch {
    // use local fallback
  }

  return {
    question: buildFollowUpQuestion(opinion, visionLabel || ''),
    source: 'local',
  };
}
