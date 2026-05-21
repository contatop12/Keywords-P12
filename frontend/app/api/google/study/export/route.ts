import { generateXlsx, StudyDoc } from "../../../../../lib/server/exportXlsx";

export async function POST(req: Request) {
  try {
    const study = (await req.json()) as StudyDoc;
    const buf = generateXlsx(study);
    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="estudo-keywords.xlsx"',
      },
    });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao gerar XLSX." },
      { status: 500 }
    );
  }
}
