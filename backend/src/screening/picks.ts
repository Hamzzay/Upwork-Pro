/**
 * R144 (Hamza): the chosen projects have an order: the first is the one the proposal shows first. pick_no is the place; a job chosen
 * before it has none, and keeps the order of the list.
 */
import type { PoolConnection } from 'mysql2/promise';

export const PICK_ORDER = 'COALESCE(pick_no, rank_no), rank_no';

/** The projects chosen for a job, first one first. */
export async function setPicks(conn: Pick<PoolConnection, 'query'>, screeningId: number, ids: number[]) {
  await conn.query('UPDATE job_matches SET selected=(project_id IN (?)), pick_no=IF(project_id IN (?), FIELD(project_id, ?), NULL) WHERE screening_id=?', [ids, ids, ids, screeningId]);
}
