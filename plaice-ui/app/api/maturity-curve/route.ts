import { predict } from "../../lib/predictionGrid";

export interface MaturityPoint {
  age: number;
  probability: number;
  lower: number;
  upper: number;
  ciReliable: boolean;
  note: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cohort = Number(searchParams.get("cohort"));
  const ageMin = Number(searchParams.get("ageMin"));
  const ageMax = Number(searchParams.get("ageMax"));

  if (!Number.isInteger(cohort) || !Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin > ageMax) {
    return Response.json({ error: "cohort, ageMin, ageMax must be integers with ageMin <= ageMax" }, { status: 400 });
  }

  const ages = Array.from({ length: ageMax - ageMin + 1 }, (_, i) => ageMin + i);

  const points: MaturityPoint[] = [];
  const errors: { age: number; error: string }[] = [];

  for (const age of ages) {
    const result = predict(age, cohort);
    if ("error" in result) {
      errors.push({ age, error: result.error });
    } else {
      points.push({
        age,
        probability: result.probability,
        lower: result.ciLower,
        upper: result.ciUpper,
        ciReliable: result.ciReliable,
        note: result.note,
      });
    }
  }

  return Response.json({ cohort, points, errors });
}
