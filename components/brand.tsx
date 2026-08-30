import Image from "next/image";

export function BrandMark() {
  return <Image className="brand-mark" src="/brand/gc-monogram.png" width={80} height={80} alt="GC" unoptimized priority />;
}

export function Brand() {
  return <div className="brand-lockup"><BrandMark /><strong>谷仓</strong></div>;
}
