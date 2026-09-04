"use client";

import { Plus } from "lucide-react";

type EmptyStateProps = {
  title?: string;
  description: string;
  action?: string;
  onClick?: () => void;
  href?: string;
};

function Content({ title, description }: Pick<EmptyStateProps, "title" | "description">) {
  return (
    <>
      <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-ink text-white shadow-sm md:h-14 md:w-14 md:rounded-2xl">
        <Plus size={26} strokeWidth={2.1} className="md:h-5 md:w-5" />
      </span>
      {title ? <p className="mt-5 text-[15px] font-semibold tracking-tight text-ink md:text-[13px]">{title}</p> : null}
      <p className={`${title ? "mt-1" : "mt-5"} text-sm leading-relaxed text-muted md:text-xs`}>{description}</p>
    </>
  );
}

export function EmptyState({ title, description, onClick, href }: EmptyStateProps) {
  const base = "card group flex w-full max-w-[360px] flex-col items-center justify-center px-8 py-10 text-center transition md:max-w-[340px] md:px-6 md:py-8 min-h-[280px] md:min-h-[260px]";
  const hover = "hover:shadow-float hover:border-line";

  if (href) {
    return (
      <a href={href} className={`${base} ${hover}`}>
        <Content title={title} description={description} />
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`${base} ${hover} cursor-pointer`}>
      <Content title={title} description={description} />
    </button>
  );
}
