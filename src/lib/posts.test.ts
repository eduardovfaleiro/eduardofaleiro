import { describe, expect, it } from 'vitest';
import { selectPublished } from './posts';

const post = (id: string, pubDate: string, draft = false) => ({
  id,
  data: { pubDate: new Date(pubDate), draft },
});

describe('selectPublished', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const input = [
      post('older', '2026-01-01'),
      post('newer', '2026-06-01'),
      post('middle', '2026-03-01'),
    ];

    expect(selectPublished(input).map((p) => p.id)).toEqual([
      'newer',
      'middle',
      'older',
    ]);
  });

  it('remove rascunhos por padrão', () => {
    const input = [post('published', '2026-01-01'), post('hidden', '2026-06-01', true)];

    expect(selectPublished(input).map((p) => p.id)).toEqual(['published']);
  });

  it('mantém rascunhos quando includeDrafts é true', () => {
    const input = [post('published', '2026-01-01'), post('hidden', '2026-06-01', true)];

    expect(selectPublished(input, true).map((p) => p.id)).toEqual([
      'hidden',
      'published',
    ]);
  });

  it('trata draft ausente como publicado', () => {
    const input = [{ id: 'no-flag', data: { pubDate: new Date('2026-01-01') } }];

    expect(selectPublished(input).map((p) => p.id)).toEqual(['no-flag']);
  });

  it('não muta o array recebido', () => {
    const input = [post('a', '2026-01-01'), post('b', '2026-06-01')];

    selectPublished(input);

    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
