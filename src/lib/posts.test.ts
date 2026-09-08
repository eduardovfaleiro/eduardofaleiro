import { describe, expect, it } from 'vitest';
import {
  blogIndexHref,
  buildTranslations,
  byLang,
  findTranslation,
  postHref,
  rssHref,
  selectPublished,
  translationKeyOf,
  type Lang,
} from './posts';

const post = (id: string, pubDate: string, draft = false, lang: Lang = 'en') => ({
  id,
  data: { pubDate: new Date(pubDate), draft, lang },
});

const translated = (id: string, translationKey: string, pubDate = '2026-01-01') => ({
  id,
  data: { pubDate: new Date(pubDate), draft: false, lang: 'pt' as Lang, translationKey },
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
    const input = [
      { id: 'no-flag', data: { pubDate: new Date('2026-01-01'), lang: 'en' as Lang } },
    ];

    expect(selectPublished(input).map((p) => p.id)).toEqual(['no-flag']);
  });

  it('não muta o array recebido', () => {
    const input = [post('a', '2026-01-01'), post('b', '2026-06-01')];

    selectPublished(input);

    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('byLang', () => {
  it('filtra os posts de um idioma', () => {
    const input = [
      post('en-post', '2026-01-01'),
      translated('pt-post', 'en-post'),
      post('outro-en', '2026-02-01'),
    ];

    expect(byLang(input, 'en').map((p) => p.id)).toEqual(['en-post', 'outro-en']);
    expect(byLang(input, 'pt').map((p) => p.id)).toEqual(['pt-post']);
  });

  it('preserva a ordem recebida', () => {
    const input = selectPublished([
      post('older', '2026-01-01'),
      post('newer', '2026-06-01'),
    ]);

    expect(byLang(input, 'en').map((p) => p.id)).toEqual(['newer', 'older']);
  });
});

describe('translationKeyOf', () => {
  it('usa translationKey quando presente', () => {
    expect(translationKeyOf(translated('ola-mundo', 'hello-world'))).toBe('hello-world');
  });

  it('cai no id do post quando translationKey está ausente', () => {
    expect(translationKeyOf(post('hello-world', '2026-01-01'))).toBe('hello-world');
  });
});

describe('findTranslation', () => {
  const en = post('hello-world', '2026-01-01');
  const pt = translated('ola-mundo', 'hello-world');

  it('acha a tradução a partir do original', () => {
    expect(findTranslation([en, pt], en)?.id).toBe('ola-mundo');
  });

  it('acha o original a partir da tradução', () => {
    expect(findTranslation([en, pt], pt)?.id).toBe('hello-world');
  });

  it('não acha par quando só existe um idioma', () => {
    expect(findTranslation([en], en)).toBeUndefined();
  });

  it('ignora candidatos do mesmo idioma', () => {
    const gemeo = { ...post('other', '2026-01-01'), data: { ...en.data } };

    expect(findTranslation([en, gemeo], en)).toBeUndefined();
  });

  it('não acha par ausente da lista, que é o caso do rascunho', () => {
    const publicados = selectPublished([en, { ...pt, data: { ...pt.data, draft: true } }]);

    expect(findTranslation(publicados, en)).toBeUndefined();
  });

  it('não confunde posts de chaves diferentes', () => {
    const outraTraducao = translated('outro-pt', 'outro-en');

    expect(findTranslation([en, outraTraducao], en)).toBeUndefined();
  });
});

describe('buildTranslations', () => {
  it('agrupa original e tradução sob a mesma chave', () => {
    const en = post('hello-world', '2026-01-01');
    const pt = translated('ola-mundo', 'hello-world');

    const grupos = buildTranslations([en, pt]);

    expect(grupos.get('hello-world')).toEqual({ en, pt });
  });

  it('lança quando dois posts do mesmo idioma têm a mesma chave', () => {
    const pt = translated('ola-mundo', 'hello-world');
    const duplicado = translated('ola-mundo-2', 'hello-world');

    expect(() => buildTranslations([pt, duplicado])).toThrow(/translationKey "hello-world"/);
  });

  it('aceita chaves iguais em idiomas diferentes', () => {
    expect(() =>
      buildTranslations([post('hello-world', '2026-01-01'), translated('ola', 'hello-world')]),
    ).not.toThrow();
  });
});

describe('URLs', () => {
  it('põe o inglês na raiz e o português sob /pt', () => {
    expect(postHref(post('hello-world', '2026-01-01'))).toBe('/blog/hello-world/');
    expect(postHref(translated('ola-mundo', 'hello-world'))).toBe('/pt/blog/ola-mundo/');
  });

  it('gera o índice e o feed de cada idioma', () => {
    expect(blogIndexHref('en')).toBe('/blog/');
    expect(blogIndexHref('pt')).toBe('/pt/blog/');
    expect(rssHref('en')).toBe('/rss.xml');
    expect(rssHref('pt')).toBe('/pt/rss.xml');
  });
});
