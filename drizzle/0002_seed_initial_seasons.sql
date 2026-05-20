-- Seed seasons for 2026 (current) through 2029, following the historical
-- −3-share rotation anchored at 2024 = J: 2025=G, 2026=D, 2027=A, 2028=H,
-- 2029=E. Start weeks follow the canonical anchor "second-to-last ISO week
-- of May" (Thursday rule): 2026 and 2029 land on W21; 2027 and 2028 land on
-- W20 because May 31 falls Mon/Wed in those years. Admins can override via
-- the season service later.
INSERT INTO "season" ("year", "start_week", "start_share") VALUES
  (2026, 21, 'D'),
  (2027, 20, 'A'),
  (2028, 20, 'H'),
  (2029, 21, 'E');
