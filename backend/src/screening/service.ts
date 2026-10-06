import { run } from '../llm';
import { config } from '../config';
import { buildReportJsonSchema, contractAddendum, report, type ProjectLite, type Report, type RuleRow } from './contract';

export interface ScreeningContext { rules: RuleRow[]; projects: ProjectLite[] }

export async function screenJobText(jobText: string, skillContent: string, ctx: ScreeningContext): Promise<Report> {
  const r = await run({
    label: 'screening',
    model: config.llm.model,
    system: skillContent + contractAddendum(ctx.rules, ctx.projects),
    prompt: `<job_page>\n${jobText}\n</job_page>`,
    schema: buildReportJsonSchema(ctx.rules.map((x) => x.code)),
    timeoutMs: config.llm.timeoutMs,
  });
  // A schema-shaped answer is not a true answer, but a malformed one must never be saved.
  const parsed = report.safeParse(r.data);
  if (!parsed.success) throw new Error('invalid_output');
  return parsed.data;
}
