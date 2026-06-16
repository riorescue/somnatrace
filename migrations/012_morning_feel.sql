-- Per-session morning feel rating: how the user felt upon waking.
-- Values: 'good' | 'fair' | 'poor' | NULL (not reported)
ALTER TABLE sessions ADD COLUMN morning_feel TEXT;
