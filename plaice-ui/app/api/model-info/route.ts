import { modelMeta } from "../../lib/predictionGrid";

export async function GET() {
  return Response.json(modelMeta);
}
