#!/bin/sh
# Ricrea il DB di test, applica la migrazione ed esegue i test
psql -h /tmp -p 5544 -U postgres -q -c "drop database if exists cp" -c "create database cp" >/dev/null
psql -h /tmp -p 5544 -U postgres -d cp -v ON_ERROR_STOP=1 -q -f supabase_stub.sql >/dev/null
for f in ../supabase/migrations/*.sql; do psql -h /tmp -p 5544 -U postgres -d cp -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE; done
psql -h /tmp -p 5544 -U postgres -d cp -q -t -A -f test_flows.sql 2>&1 | grep -v '^$'
