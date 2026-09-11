const BRANDS = [
  { id: "el-gallo", src: "/brands/el-gallo.png", alt: "El Gallo" },
  { id: "mazeite", src: "/brands/mazeite.png", alt: "Mazeite" },
  { id: "del-cesar", src: "/brands/del-cesar.png", alt: "Del César" },
  { id: "trigo-de-oro", src: "/brands/trigo-de-oro.png", alt: "Trigo de Oro" },
  { id: "el-rey", src: "/brands/el-rey.png", alt: "El Rey" },
  { id: "domino", src: "/brands/domino.png", alt: "Dominó" },
  { id: "hispano", src: "/brands/hispano.png", alt: "Hispano" },
  { id: "kinsu", src: "/brands/kinsu.png", alt: "Kinsú" },
  { id: "aurora", src: "/brands/aurora.png", alt: "Aurora" },
  { id: "brillante", src: "/brands/brillante.png", alt: "Brillante" },
];

const POS = [
  { top: "8%", left: "18%" },
  { top: "12%", right: "16%" },
  { top: "32%", left: "14%" },
  { top: "38%", right: "12%" },
  { top: "58%", left: "20%" },
  { top: "64%", right: "18%" },
  { top: "78%", left: "28%" },
  { top: "82%", right: "22%" },
  { top: "48%", left: "40%" },
  { top: "22%", right: "36%" },
];

export default function BrandBackdrop() {
  return (
    <div className="brand-backdrop" aria-hidden="true">
      <div className="brand-blob brand-blob-a" />
      <div className="brand-blob brand-blob-b" />
      {BRANDS.map((brand, i) => (
        <img
          key={brand.id}
          src={brand.src}
          alt=""
          className="brand-float"
          style={{
            ...POS[i % POS.length],
            animationDuration: `${9 + (i % 5)}s`,
            animationDelay: `${i * 0.5}s`,
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ))}
    </div>
  );
}