import type { ProofReport } from "../../eval/run";
import { ProofScorecard } from "../components/ProofScorecard";
import { load } from "../page-data";

export default async function ProofPage() {
  const { status, data } = await load<{ report: ProofReport }>("/api/proof");
  if (status === 401) return <p>Pick a session in the sidebar to continue.</p>;
  return (
    <>
      <h2>Proof</h2>
      {data && <ProofScorecard report={data.report} />}
    </>
  );
}
