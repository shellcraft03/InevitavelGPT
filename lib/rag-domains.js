export const LIVRO_TOPIC_EXPANSIONS = [
  {
    pattern: /\bsa[uú]de\b|\bsus\b|\bhospital\b|\bmedic/i,
    terms: 'saude sus hospitais medicos atendimento prevencao financiamento filas gestao hospitalar',
  },
  {
    pattern: /\beduca[cç][aã]o\b|\bescola\b|\bensino\b|\bprofessor/i,
    terms: 'educacao escola ensino professores alunos alfabetizacao universidade formacao tecnica ensino basico ensino superior curriculo',
  },
  {
    pattern: /\bseguran[cç]a\b|\bcrime\b|\bpol[ií]cia\b|\bviol[eê]ncia\b/i,
    terms: 'seguranca publica crime policia violencia criminalidade prisao impunidade justica ordem',
  },
  {
    pattern: /\beconomia\b|\bimposto\b|\btribut|\bemprego\b|\brenda\b/i,
    terms: 'economia impostos reforma tributaria crescimento fiscal gasto publico produtividade investimento emprego renda mercado',
  },
  {
    pattern: /\bmobilidade\b|\btransporte\b|\btr[aâ]nsito\b|\bonibus\b|\bmetro\b/i,
    terms: 'mobilidade urbana transporte transito onibus metro infraestrutura deslocamento cidade',
  },
];

export const LIVRO_STOPWORDS = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sobre', 'que', 'qual',
  'quais', 'como', 'livro', 'amarelo', 'plano', 'proposta', 'propostas', 'tema',
  'fala', 'diz', 'trata', 'explique', 'explica',
]);

export const ENTREVISTAS_TOPIC_EXPANSIONS = [
  {
    pattern: /\beduca[cç][aã]o\b|\bescola\b|\bensino\b|\bprofessor/i,
    terms: 'educacao escola ensino professores alunos alfabetizacao universidade formacao tecnica ensino basico ensino superior gestao escolar curriculo',
  },
  {
    pattern: /\bseguran[cç]a\b|\bcrime\b|\bpol[ií]cia\b|\bviol[eê]ncia\b/i,
    terms: 'seguranca publica crime policia violencia criminalidade prisao faccoes impunidade justica soberania ordem',
  },
  {
    pattern: /\beconomia\b|\bimposto\b|\btribut/i,
    terms: 'economia impostos reforma tributaria crescimento fiscal gasto publico produtividade investimento emprego renda mercado',
  },
  {
    pattern: /\bsa[uú]de\b|\bsus\b|\bhospital\b/i,
    terms: 'saude sus hospitais medicos atendimento gestao hospitalar prevencao financiamento filas',
  },
];

export const ENTREVISTAS_STOPWORDS = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sobre', 'que', 'qual',
  'quais', 'como', 'ele', 'ela', 'renan', 'santos', 'pensa', 'acha', 'disse',
  'fala', 'falou', 'respondeu', 'resposta',
]);
