-- Seed seasons for 2026 (current) through 2029, following the historical
-- −3-share rotation anchored at 2024 = J: 2025=G, 2026=D, 2027=A, 2028=H,
-- 2029=E. All four years start at ISO week 21 (the historical Disponeringslista
-- column). Admins can edit these rows via the season service later.
INSERT INTO "season" ("year", "start_week", "start_share") VALUES
  (2026, 21, 'D'),
  (2027, 21, 'A'),
  (2028, 21, 'H'),
  (2029, 21, 'E');
