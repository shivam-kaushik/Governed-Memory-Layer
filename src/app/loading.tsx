import { MnemoCanvas } from "./components/three";

// Shown by Next while a page's server data loads. The cube in the fallback paints instantly; Mnemo takes over when WebGL is ready.
export default function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <MnemoCanvas size="load" mood="thinking" />
      <p className="loading-t">Recalling governed memory<span className="dots" aria-hidden><i>.</i><i>.</i><i>.</i></span></p>
      <div className="loading-bar" aria-hidden><span /></div>
      <small className="loading-s">checking scope, version and expiry first</small>
    </div>
  );
}
