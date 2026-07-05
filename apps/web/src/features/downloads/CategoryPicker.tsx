import { BookOpen, Film, type LucideIcon, Music2, Search, Tv } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Item, ItemContent } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isCategoryActive, type ProwlarrCategory } from "@/lib/prowlarr-categories";
import { cn } from "@/lib/utils";

/** Torznab top-level category ids: 2000 Movies, 3000 Audio, 5000 TV, 7000 Books. */
const CATEGORY_GROUP_ICONS: Record<number, LucideIcon> = {
  2000: Film,
  3000: Music2,
  5000: Tv,
  7000: BookOpen,
};

/** Strips the "Audio/", "Movies/" etc. prefix Prowlarr puts on subcategory names. */
function shortLabel(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

function filterCategories(categories: ProwlarrCategory[], query: string): ProwlarrCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  return categories
    .map((group) => {
      const groupMatches = group.name.toLowerCase().includes(q);
      const subCategories = groupMatches
        ? group.subCategories
        : group.subCategories.filter((sub) => sub.name.toLowerCase().includes(q));
      return { ...group, subCategories };
    })
    .filter((group) => group.name.toLowerCase().includes(q) || group.subCategories.length > 0);
}

function triggerMeta(
  categories: ProwlarrCategory[],
  value: string[],
): { label: string; Icon: LucideIcon | undefined } {
  if (value.length === 0) return { label: "Select categories", Icon: undefined };
  if (value.length > 1) return { label: `${value.length} categories`, Icon: undefined };
  const id = value[0];
  for (const group of categories) {
    if (String(group.id) === id) {
      return { label: `All ${group.name}`, Icon: CATEGORY_GROUP_ICONS[group.id] };
    }
    for (const sub of group.subCategories) {
      if (String(sub.id) === id) {
        return { label: shortLabel(sub.name), Icon: CATEGORY_GROUP_ICONS[group.id] };
      }
    }
  }
  return { label: "Select categories", Icon: undefined };
}

type CategoryOptionProps = {
  id: string;
  label: string;
  checked: boolean;
  indent?: boolean;
  onToggle: (checked: boolean) => void;
};

function CategoryOption({ id, label, checked, indent, onToggle }: CategoryOptionProps) {
  const inputId = `category-option-${id}`;
  return (
    <Item size="sm" className={cn("gap-2 p-0 px-2 py-1.5", indent && "pl-8")}>
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(next) => onToggle(next === true)}
      />
      <ItemContent className="flex-none gap-0">
        <label
          htmlFor={inputId}
          className={cn(
            "cursor-pointer font-normal leading-snug",
            indent ? "text-xs text-muted-foreground" : "text-sm text-foreground",
          )}
        >
          {label}
        </label>
      </ItemContent>
    </Item>
  );
}

type CategoryPickerProps = {
  categories: ProwlarrCategory[];
  activeIds: number[] | null;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function CategoryPicker({
  categories,
  activeIds,
  value,
  onChange,
  disabled,
  className,
}: CategoryPickerProps) {
  const [filter, setFilter] = React.useState("");
  const { label, Icon } = triggerMeta(categories, value);
  const filtered = filterCategories(categories, filter);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((existing) => existing !== id));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("justify-between gap-2 font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {Icon && <Icon size={14} className="shrink-0 text-muted-foreground" />}
            <span className="truncate">{label}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0 shadow-none">
        <div className="flex items-center gap-1.5 border-b border-border px-2">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.currentTarget.value)}
            placeholder="Filter categories…"
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No categories match “{filter}”
            </div>
          ) : (
            filtered.map((group, i) => {
              const GroupIcon = CATEGORY_GROUP_ICONS[group.id];
              return (
                <React.Fragment key={group.id}>
                  {i > 0 && <div className="my-1 h-px bg-border" />}
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {GroupIcon && <GroupIcon size={12} className="shrink-0" />}
                    {group.name}
                  </div>
                  {isCategoryActive(group.id, activeIds) && (
                    <CategoryOption
                      id={String(group.id)}
                      label={`All ${group.name}`}
                      checked={value.includes(String(group.id))}
                      onToggle={(checked) => toggle(String(group.id), checked)}
                    />
                  )}
                  {group.subCategories.map((sub) => (
                    <CategoryOption
                      key={sub.id}
                      id={String(sub.id)}
                      label={shortLabel(sub.name)}
                      indent
                      checked={value.includes(String(sub.id))}
                      onToggle={(checked) => toggle(String(sub.id), checked)}
                    />
                  ))}
                </React.Fragment>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
