import './brand-logo.css';

/** Existing brand artwork, retained until the replacement PNG is provided. */
export default function BrandLogo() {
  return <span className="calori-logo" role="img" aria-label="Calori Go · Mobilidade elétrica">
    <img src="/brand/logo.png" width={1080} height={1080} alt="" aria-hidden="true" decoding="async"/>
    <strong aria-hidden="true">Go</strong>
  </span>;
}
