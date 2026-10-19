import { guardCircleResult } from '../guardCircleResult';
import { setActiveCircleId } from '@/lib/circleContext';

test('rejects old content even if switching happens during profile enrichment', async () => {
  let finish!: () => void;
  const enrichment = new Promise<void>(resolve => { finish = resolve; });
  const service = guardCircleResult({ async load() { const posts = ['private A']; await enrichment; return posts; } });
  setActiveCircleId('A');
  const result = service.load();
  setActiveCircleId('B');
  finish();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  setActiveCircleId(null);
});
