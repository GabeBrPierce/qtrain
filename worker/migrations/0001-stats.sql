-- Run once on a database created before the Stats screens (schema.sql already has these columns).
ALTER TABLE rounds ADD COLUMN prng_hex TEXT;
ALTER TABLE rounds ADD COLUMN stats_n INTEGER;
ALTER TABLE rounds ADD COLUMN q_mean REAL;
ALTER TABLE rounds ADD COLUMN p_mean REAL;
ALTER TABLE rounds ADD COLUMN null_var REAL;
ALTER TABLE picks ADD COLUMN chance_q REAL;
ALTER TABLE picks ADD COLUMN chance_p REAL;
