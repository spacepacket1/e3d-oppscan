type SectionHeadingProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  align?: "left" | "center";
  titleId?: string;
  as?: "h1" | "h2";
};

export function SectionHeading({
  title,
  eyebrow,
  description,
  align = "left",
  titleId,
  as = "h2",
}: SectionHeadingProps) {
  const HeadingTag = as;

  return (
    <header className={`section-heading section-heading--${align}`}>
      {eyebrow ? <p className="section-heading__eyebrow">{eyebrow}</p> : null}
      <HeadingTag className="section-heading__title" id={titleId}>
        {title}
      </HeadingTag>
      {description ? (
        <p className="section-heading__description">{description}</p>
      ) : null}
    </header>
  );
}
