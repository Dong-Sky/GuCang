type PageHeaderProps = {
  title: string;
  countLabel?: string;
};

export function PageHeader({ title, countLabel }: PageHeaderProps) {
  return (
    <header className="page-title-row primary-page-header">
      <h1>{title}</h1>
      {countLabel ? <span className="title-count">{countLabel}</span> : null}
    </header>
  );
}
