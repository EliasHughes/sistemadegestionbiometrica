type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function PlaceholderPage({
  title,
  description = "Este módulo se implementará en una fase posterior.",
}: PlaceholderPageProps) {
  return (
    <div>
      <h2 className="text-lg font-bold text-zinc-900 mb-1">{title}</h2>
      <p className="text-sm text-zinc-500 mb-6">{description}</p>
      <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center max-w-md">
        <p className="text-sm text-zinc-600">Página en construcción</p>
      </div>
    </div>
  );
}