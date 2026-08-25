import { getVersion, listVersionChoices } from '@/lib/repo';
import { CompareView, type SideData } from '@/components/compare-view';

export const dynamic = 'force-dynamic';

// Next 16: searchParams is a Promise and must be awaited.
export default async function ComparePage(props: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { left: leftId, right: rightId } = await props.searchParams;
  const choices = listVersionChoices();

  function hydrate(versionId?: string): SideData | null {
    if (!versionId) return null;
    const choice = choices.find((c) => c.versionId === versionId);
    const version = getVersion(versionId);
    if (!choice || !version) return null;
    return { ...choice, sections: version.sections };
  }

  return (
    <CompareView
      choices={choices}
      left={hydrate(leftId)}
      right={hydrate(rightId)}
    />
  );
}
