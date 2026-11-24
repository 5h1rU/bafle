// VIEW

const SECONDS_PER_MINUTE = 60;

/** A length or a position as a listener reads it: `4:07`. */
export const formatDuration = (durationSeconds: number): string => {
  const whole = Math.max(0, Math.floor(durationSeconds));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const seconds = whole % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};
