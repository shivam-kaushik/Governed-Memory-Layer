import type { ProofReport } from "../../eval/run";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function ProofScorecard({ report }: { report: ProofReport }) {
  return (
    <section>
      <p>
        Brain: <strong>{report.brain}</strong>. Seeds: {report.seeds}. The deterministic brain proves plumbing and governance, not model
        behavior.
      </p>
      <table>
        <thead><tr><th>Arm</th><th>Success</th><th>Rate</th><th>95% CI</th></tr></thead>
        <tbody>
          {(["R", "O", "P", "C"] as const).map((a) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{report.arms[a].success} / {report.arms[a].n}</td>
              <td>{pct(report.arms[a].rate)}</td>
              <td>{pct(report.arms[a].ci[0])} to {pct(report.arms[a].ci[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>R minus P: {pct(report.uplift.rMinusP)} (CI {pct(report.uplift.lower)} to {pct(report.uplift.upper)})</li>
        <li>Targeted response: {pct(report.targetedResponse)}</li>
        <li>Collateral stability: {pct(report.collateralStability)}</li>
        <li>Harmful adoption: {report.harmfulAdoption} / {report.harmfulTrials}</li>
      </ul>
      <p>
        Zero harmful adoptions in {report.harmfulTrials} trials is an observed count, not proof of impossibility. The proof shows that
        changing memory input changes the observable action, not the model's internal mechanism.
      </p>
    </section>
  );
}
