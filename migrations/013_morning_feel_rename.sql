-- Rename morning_feel values from the original labels to the finalized ones.
UPDATE sessions SET morning_feel = 'good' WHERE morning_feel = 'great';
UPDATE sessions SET morning_feel = 'fair' WHERE morning_feel = 'ok';
