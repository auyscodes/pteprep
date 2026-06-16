export interface Question {
  id: string;
  question_type: string;
  topic_title: string;
  topic_tag: string;
  difficulty: number;
  cefr_level: string;
  word_count: number;
  has_audio: boolean;
  has_image: boolean;
  passage_text: string;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  user_id: string;
  created_at: string;
  ended_at?: string | null;
}
