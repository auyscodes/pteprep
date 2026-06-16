import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface Question {
  id: string;
  passage_text: string;
}

interface ReadAloudPlayerProps {
  question: Question;
}

type Status =
  | "idle"
  | "creating_session"
  | "recording"
  | "uploading"
  | "uploaded"
  | "submitting"
  | "submitted"
  | "completed"
  | "failed"
  | "error";

interface Score {
  fluency: number;
  pronunciation: number;
  content: number;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export function ReadAloudPlayer({
  question,
}: ReadAloudPlayerProps): React.ReactNode {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [score, setScore] = useState<Score | null>(null);
  const [micAvailable, setMicAvailable] = useState<boolean | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollAttempt = useCallback(async () => {
    if (!attemptIdRef.current) return;
    try {
      const data = await apiFetch<Record<string, unknown>>(
        `/v1/attempts/${attemptIdRef.current}`
      );
      const s = data.status as string;
      if (s === "completed") {
        clearPolling();
        setScore(data.score as Score);
        setStatus("completed");
      } else if (s === "failed") {
        clearPolling();
        setStatus("failed");
      }
    } catch {
      // polling failures are silent
    }
  }, [clearPolling]);

  const startRecording = useCallback(async () => {
    setError(null);
    setStatus("creating_session");

    try {
      if (!sessionIdRef.current) {
        const session = await apiFetch<{ id: string }>("/v1/sessions", {
          method: "POST",
        });
        sessionIdRef.current = session.id;
      }

      const attempt = await apiFetch<{ id: string }>(
        `/v1/sessions/${sessionIdRef.current}/attempts`,
        {
          method: "POST",
          body: JSON.stringify({ question_id: question.id }),
        }
      );
      attemptIdRef.current = attempt.id;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimer();

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadRecording(blob);
      };

      mediaRecorder.start();
      setRecordingSeconds(0);
      setStatus("recording");

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setStatus("error");
      const message =
        err instanceof Error ? err.message : "Failed to create session";
      setError(message);
      clearTimer();
    }
  }, [question.id, clearTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const uploadRecording = useCallback(
    async (blob: Blob) => {
      if (!attemptIdRef.current) return;
      setStatus("uploading");
      setUploadProgress(0);

      try {
        const { uploadUrl } = await apiFetch<{
          uploadUrl: string;
          key: string;
        }>("/v1/recordings/upload-url", {
          method: "POST",
          body: JSON.stringify({ attemptId: attemptIdRef.current }),
        });

        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        setUploadProgress(100);

        setStatus("uploaded");
      } catch (err) {
        setStatus("error");
        const message =
          err instanceof Error ? err.message : "Upload failed";
        setError(message);
      }
    },
    []
  );

  const submitForScoring = useCallback(async () => {
    if (!attemptIdRef.current) return;
    setStatus("submitting");
    setError(null);

    try {
      await apiFetch(`/v1/attempts/${attemptIdRef.current}/submit`, {
        method: "POST",
      });
      setStatus("submitted");

      pollRef.current = setInterval(() => {
        pollAttempt();
      }, 2000);
    } catch (err) {
      setStatus("error");
      const message =
        err instanceof Error ? err.message : "Submit failed";
      setError(message);
    }
  }, [pollAttempt]);

  useEffect(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          setMicAvailable(true);
        })
        .catch(() => {
          setMicAvailable(false);
        });
    } else {
      setMicAvailable(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      clearPolling();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [clearTimer, clearPolling]);

  if (micAvailable === false) {
    return (
      <div>
        <p>{question.passage_text}</p>
        <p role="alert">
          Microphone access is required for recording. Please allow microphone
          access in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p data-testid="passage-text">{question.passage_text}</p>

      {status === "idle" && (
        <button type="button" onClick={startRecording}>
          Start Recording
        </button>
      )}

      {status === "creating_session" && <p>Preparing...</p>}

      {status === "recording" && (
        <div>
          <p role="status">
            Recording: {formatTime(recordingSeconds)}
          </p>
          <button type="button" onClick={stopRecording}>
            Stop Recording
          </button>
        </div>
      )}

      {status === "uploading" && (
        <div>
          <p>Uploading... {uploadProgress}%</p>
          <progress value={uploadProgress} max={100} />
        </div>
      )}

      {status === "uploaded" && (
        <div>
          <p>Recording uploaded. Ready to submit.</p>
          <button type="button" onClick={submitForScoring}>
            Submit for Scoring
          </button>
        </div>
      )}

      {status === "submitting" && <p>Submitting...</p>}

      {status === "submitted" && (
        <p role="status">
          Submitted. Waiting for scoring results...
        </p>
      )}

      {status === "completed" && score && (
        <div>
          <h3>Your Scores</h3>
          <p data-testid="score-fluency">Fluency: {score.fluency}</p>
          <p data-testid="score-pronunciation">
            Pronunciation: {score.pronunciation}
          </p>
          <p data-testid="score-content">Content: {score.content}</p>
        </div>
      )}

      {status === "failed" && (
        <p role="alert">
          Scoring failed. Please try recording and submitting again.
        </p>
      )}

      {status === "error" && error && <p role="alert">{error}</p>}
    </div>
  );
}
