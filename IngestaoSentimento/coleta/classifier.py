import os
import re
import json
import logging
from openai import OpenAI

log = logging.getLogger(__name__)
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=4, timeout=30.0)


def _safe_label(text):
    return re.sub(r'[\r\n\x00-\x1f]', ' ', str(text)).strip()[:100]


def classify_texts_individual(texts, candidate_nome, candidate_contexto=""):
    """Returns list of sentiments ('positivo','neutro','negativo') aligned with texts.
    Failed batches are omitted, so result may be shorter than texts."""
    if not texts:
        return []

    results = []
    batch_size = 20
    nome = _safe_label(candidate_nome)
    ctx = _safe_label(candidate_contexto)
    prompt_prefix = (
        f"Você é um analista político. Classifique cada texto abaixo como positivo, neutro ou negativo "
        f"em relação ao candidato {nome}"
        + (f" ({ctx})" if ctx else "")
        + f", do ponto de vista da imagem e da campanha política do candidato.\n\n"
        f"POSITIVO: elogio direto, declaração de voto, apoio, crescimento nas pesquisas/mercados, "
        f"ataque bem-sucedido a rival, rival perdendo espaço, defesa do candidato contra críticas, "
        f"declaração do próprio candidato comparando rivais a coisas ruins (posiciona o candidato como melhor opção).\n"
        f"NEGATIVO: crítica direta ao candidato, associação do candidato a escândalo ou incompetência, "
        f"queda nas pesquisas, piada ou meme que ridiculariza o candidato, ataque de adversários sem resposta.\n"
        f"NEUTRO: menção puramente informativa sem tom, agenda de evento, citação de frase sem contexto "
        f"avaliativo, ou texto sobre outro assunto que apenas cita o nome.\n\n"
        f"ATENÇÃO: quando o próprio {nome} usa linguagem negativa para descrever RIVAIS "
        f"(compara adversários a doenças, desastres, problemas), isso é POSITIVO — o candidato está "
        f"se posicionando como alternativa melhor, não sendo atacado.\n\n"
        f"Exemplos POSITIVO: 'vou votar em {nome}', '{nome} sobe nas pesquisas', "
        f"'rival despenca e {nome} se aproxima', '{nome} detona adversário em debate', "
        f"'{nome} diz que escolher entre rivais é como escolher entre duas tragédias'\n"
        f"Exemplos NEGATIVO: '{nome} envolvido em polêmica', '{nome} perde apoio', "
        f"'pesquisa mostra queda de {nome}'\n\n"
        f"Responda APENAS com JSON: "
        f'{{\"c\": [\"positivo\",\"neutro\",\"negativo\",...]}}\n\n'
    )

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        numbered = "\n".join(f"{j + 1}. {t[:280]}" for j, t in enumerate(batch))
        try:
            resp = client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[{"role": "user", "content": prompt_prefix + numbered}],
                response_format={"type": "json_object"},
                temperature=0,
            )
            arr = json.loads(resp.choices[0].message.content).get("c", [])
            for label in arr[:len(batch)]:
                l = str(label).lower()
                if "positivo" in l:
                    results.append("positivo")
                elif "negativo" in l:
                    results.append("negativo")
                else:
                    results.append("neutro")
            while len(results) < i + len(batch):
                results.append("neutro")
        except Exception as e:
            log.warning(f"classify {candidate_nome}: {e}")
            results.extend(["neutro"] * (i + len(batch) - len(results)))

    return results


def classify_texts(texts, candidate_nome, candidate_contexto=""):
    """Returns (positivo, neutro, negativo) raw counts."""
    sentiments = classify_texts_individual(texts, candidate_nome, candidate_contexto)
    return (
        sentiments.count("positivo"),
        sentiments.count("neutro"),
        sentiments.count("negativo"),
    )


def classify_articles_for_all_candidates(texts, candidates):
    """
    Classifica uma lista de textos para TODOS os candidatos de uma vez.
    Returns: list of dicts {slug: sentimento} aligned with texts.
    Failed batches return {slug: 'neutro'} for all candidates.
    """
    if not texts:
        return []

    results = []
    batch_size = 10  # menor batch pois o prompt é maior

    candidatos_desc = "\n".join(
        f"- {c['slug']}: {c['nome']}" + (f" ({c.get('contexto', '')})" if c.get('contexto') else "")
        for c in candidates
    )
    slugs = [c["slug"] for c in candidates]
    empty = {s: "neutro" for s in slugs}

    prompt_prefix = (
        f"Você é um analista político brasileiro. Para cada texto numerado abaixo, classifique o sentimento "
        f"em relação a CADA candidato listado, do ponto de vista da imagem política de cada um.\n\n"
        f"Candidatos:\n{candidatos_desc}\n\n"
        f"POSITIVO: favorável ao candidato — elogio, crescimento, força, ataque a rival, rival perdendo espaço, "
        f"ação do governo/partido do candidato que beneficia sua imagem.\n"
        f"NEGATIVO: desfavorável — crítica, escândalo, queda, fraqueza, ataque de adversários.\n"
        f"NEUTRO: factual sem tom claro, menciona o candidato perifericamente, ou não é relevante para ele.\n\n"
        f"Responda APENAS com JSON no formato:\n"
        f'[{{"slug1": "positivo|neutro|negativo", "slug2": "...", ...}}, ...]\n'
        f"Um objeto por texto, na mesma ordem.\n\n"
    )

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        numbered = "\n".join(f"{j + 1}. {t[:300]}" for j, t in enumerate(batch))
        try:
            resp = client.chat.completions.create(
                model="gpt-4.1-nano",
                messages=[{"role": "user", "content": prompt_prefix + numbered}],
                response_format={"type": "json_object"},
                temperature=0,
            )
            # Response may be wrapped: {"results": [...]} or just [...]
            raw = json.loads(resp.choices[0].message.content)
            arr = raw if isinstance(raw, list) else next(
                (v for v in raw.values() if isinstance(v, list)), []
            )
            for j, item in enumerate(arr[:len(batch)]):
                row = {}
                for slug in slugs:
                    label = str(item.get(slug, "neutro")).lower()
                    if "positivo" in label:
                        row[slug] = "positivo"
                    elif "negativo" in label:
                        row[slug] = "negativo"
                    else:
                        row[slug] = "neutro"
                results.append(row)
            # Pad if response shorter than batch
            while len(results) < i + len(batch):
                results.append(dict(empty))
        except Exception as e:
            log.warning(f"classify_articles_for_all_candidates batch {i}: {e}")
            results.extend([dict(empty)] * len(batch))

    return results
