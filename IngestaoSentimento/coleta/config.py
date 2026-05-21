ALLOWED_RSS_SOURCES = {
    "g1", "globo", "valor economico", "folha", "uol", "estadao", "estado de s",
    "cnn", "agencia brasil", "metropoles", "correio braziliense",
    "poder360", "jovem pan", "gazeta do povo", "veja", "exame",
    "istoe", "r7", "band", "crusoe", "antagonista", "infomoney",
    "mynews", "my news"
}

CANDIDATES = [
    {
        "slug": "lula",
        "nome": "Lula",
        "partido": "PT",
        "contexto": "presidente do Brasil, governo federal, Partido dos Trabalhadores (PT)",
        "termos": ["luiz inácio lula da silva", "luiz inacio lula da silva", "lula", "luiz inácio"],
        "trends_term": "Lula",
        "twitter_query": '"lula" (presidente OR governo OR pt OR petista OR eleição OR ministro OR política) lang:pt -is:retweet',
    },
    {
        "slug": "flavio-bolsonaro",
        "nome": "Flávio Bolsonaro",
        "partido": "PL",
        "contexto": "senador, Partido Liberal (PL), filho de Jair Bolsonaro",
        "termos": ["flávio bolsonaro", "flavio bolsonaro"],
        "trends_term": "Flávio Bolsonaro",
        "twitter_query": '("flávio bolsonaro" OR "flavio bolsonaro") (senador OR eleição OR candidato) lang:pt -is:retweet',
    },
    {
        "slug": "renan-santos",
        "nome": "Renan Santos",
        "partido": "Missão",
        "contexto": "candidato à presidência, Partido Missão, ex-MBL",
        "termos": ["renan santos", "renan mbl", "renan missão", "renan presidente", "renan eleições"],
        "trends_term": "Renan Santos",
        "twitter_query": '"renan santos" (eleição OR candidato OR missão OR político OR presidente) lang:pt -is:retweet',
    },
]

