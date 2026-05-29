import { generateClassifiedXlsx, ClassifiedStudyDoc } from "../../../../../lib/server/classifiedXlsx";

export async function POST(req: Request) {
  try {
    const study = (await req.json()) as ClassifiedStudyDoc;
    const buf = generateClassifiedXlsx(study);
    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="estudo-classificado.xlsx"',
      },
    });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao gerar XLSX classificado." },
      { status: 500 }
    );
  }
}
