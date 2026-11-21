-- Xuất góp ý cũ của DGXL (ImprovementRequest + tin nhắn + sự kiện + đính kèm) thành MỘT mảng JSON.
-- Chỉ ĐỌC. Chạy trên máy chủ DGXL rồi đưa tệp cho scripts/migrate-from-dgxl.mjs:
--   docker exec -i dgxl-db psql -U dgxl -d dgxl -At -f - < scripts/dgxl-export.sql > dgxl-export.json
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t."createdAt"), '[]'::json) FROM (
  SELECT
    r.id, r.title, r.detail, r.type, r.status, r."submittedByUserId", r."submittedByName",
    r."adminNote", r."pagePath", r.scope, r."pageTarget", r.source, r."refDensity", r."clarifyRounds",
    r."pickedAt", r."codeDoneAt", r."liveAt", r."agentRuns", r."costUsd", r."rolledBack",
    r."successCriteria", r."expectedString", r."verifyResult", r."verifiedAt", r."scopeViolation",
    r."userVerdict", r."userVerdictAt", r."planApproval", r."aiProvider", r."aiModel", r.votes,
    r."createdAt", r."updatedAt",
    COALESCE((SELECT json_agg(json_build_object('id', m.id, 'role', m.role, 'kind', m.kind, 'authorName', m."authorName", 'body', m.body, 'createdAt', m."createdAt") ORDER BY m."createdAt")
              FROM "ImprovementRequestMessage" m WHERE m."requestId" = r.id), '[]'::json) AS messages,
    COALESCE((SELECT json_agg(json_build_object('kind', e.kind, 'fromStatus', e."fromStatus", 'toStatus', e."toStatus", 'actor', e.actor, 'createdAt', e."createdAt") ORDER BY e."createdAt")
              FROM "ImprovementEvent" e WHERE e."requestId" = r.id), '[]'::json) AS events,
    COALESCE((SELECT json_agg(json_build_object('fileName', a."fileName", 'mimeType', a."mimeType", 'storageKey', a."storageKey"))
              FROM "Attachment" a WHERE a.entity = 'ImprovementRequest' AND a."entityId" = r.id), '[]'::json) AS attachments
  FROM "ImprovementRequest" r
) t;
