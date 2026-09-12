-- Call rooms: streams gain a `kind`. 'broadcast' = one host publishing to
-- viewers (original topology, unchanged). 'call' = mesh video call — every
-- participant publishes to everyone else (used for LAN/online video calls).
ALTER TABLE streams ADD COLUMN kind TEXT NOT NULL DEFAULT 'broadcast';
