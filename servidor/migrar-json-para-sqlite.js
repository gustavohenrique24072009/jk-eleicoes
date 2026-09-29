const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// ==========================================
// CAMINHOS
// ==========================================

const pastaDados = path.join(__dirname, "dados");

const arquivoJSON = path.join(
    pastaDados,
    "turmas.json"
);

const arquivoBanco = path.join(
    pastaDados,
    "eleicoes.db"
);


// ==========================================
// VERIFICAR JSON
// ==========================================

if (!fs.existsSync(arquivoJSON)) {

    console.error("");
    console.error(
        "ERRO: turmas.json não foi encontrado."
    );
    console.error("");
    process.exit(1);

}


// ==========================================
// LER JSON
// ==========================================

let dados;

try {

    dados = JSON.parse(
        fs.readFileSync(
            arquivoJSON,
            "utf8"
        )
    );

} catch (erro) {

    console.error("");
    console.error(
        "ERRO ao ler turmas.json:"
    );
    console.error(erro);
    console.error("");

    process.exit(1);

}


if (
    !dados ||
    !Array.isArray(dados.turmas)
) {

    console.error("");
    console.error(
        "ERRO: estrutura do turmas.json inválida."
    );
    console.error("");

    process.exit(1);

}


// ==========================================
// ABRIR BANCO
// ==========================================

const db = new Database(
    arquivoBanco
);


// ==========================================
// CONFIGURAÇÕES DO SQLITE
// ==========================================

db.pragma("foreign_keys = ON");


// ==========================================
// CRIAR TABELAS
// ==========================================

db.exec(`

    CREATE TABLE IF NOT EXISTS turmas (

        id TEXT PRIMARY KEY,

        nome TEXT NOT NULL UNIQUE

    );


    CREATE TABLE IF NOT EXISTS eleicoes (

        turma_id TEXT PRIMARY KEY,

        nome TEXT NOT NULL DEFAULT '',

        descricao TEXT NOT NULL DEFAULT '',

        inicio TEXT,

        fim TEXT,

        ativa INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (turma_id)
            REFERENCES turmas(id)
            ON DELETE CASCADE

    );


    CREATE TABLE IF NOT EXISTS eleitores (

        id TEXT PRIMARY KEY,

        turma_id TEXT NOT NULL,

        nome TEXT NOT NULL,

        cpf TEXT NOT NULL UNIQUE,

        votou INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (turma_id)
            REFERENCES turmas(id)
            ON DELETE CASCADE

    );


    CREATE TABLE IF NOT EXISTS chapas (

        id TEXT PRIMARY KEY,

        turma_id TEXT NOT NULL,

        numero TEXT NOT NULL,

        nome TEXT NOT NULL,

        representante TEXT NOT NULL,

        vice TEXT NOT NULL,

        descricao TEXT NOT NULL DEFAULT '',

        votos INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (turma_id)
            REFERENCES turmas(id)
            ON DELETE CASCADE,

        UNIQUE (turma_id, numero)

    );


    CREATE TABLE IF NOT EXISTS votos (

        eleitor_id TEXT PRIMARY KEY,

        turma_id TEXT NOT NULL,

        chapa_id TEXT NOT NULL,

        data TEXT NOT NULL,

        FOREIGN KEY (eleitor_id)
            REFERENCES eleitores(id)
            ON DELETE CASCADE,

        FOREIGN KEY (turma_id)
            REFERENCES turmas(id)
            ON DELETE CASCADE,

        FOREIGN KEY (chapa_id)
            REFERENCES chapas(id)
            ON DELETE CASCADE

    );

`);


// ==========================================
// PREPARAR COMANDOS
// ==========================================

const inserirTurma = db.prepare(`

    INSERT INTO turmas (
        id,
        nome
    )

    VALUES (
        @id,
        @nome
    )

`);


const inserirEleicao = db.prepare(`

    INSERT INTO eleicoes (
        turma_id,
        nome,
        descricao,
        inicio,
        fim,
        ativa
    )

    VALUES (
        @turma_id,
        @nome,
        @descricao,
        @inicio,
        @fim,
        @ativa
    )

`);


const inserirEleitor = db.prepare(`

    INSERT INTO eleitores (
        id,
        turma_id,
        nome,
        cpf,
        votou
    )

    VALUES (
        @id,
        @turma_id,
        @nome,
        @cpf,
        @votou
    )

`);


const inserirChapa = db.prepare(`

    INSERT INTO chapas (
        id,
        turma_id,
        numero,
        nome,
        representante,
        vice,
        descricao,
        votos
    )

    VALUES (
        @id,
        @turma_id,
        @numero,
        @nome,
        @representante,
        @vice,
        @descricao,
        @votos
    )

`);


const inserirVoto = db.prepare(`

    INSERT INTO votos (
        eleitor_id,
        turma_id,
        chapa_id,
        data
    )

    VALUES (
        @eleitor_id,
        @turma_id,
        @chapa_id,
        @data
    )

`);


// ==========================================
// MIGRAÇÃO
// ==========================================

const migrar = db.transaction(() => {

    for (
        const turma
        of dados.turmas
    ) {

        // ------------------------------
        // TURMA
        // ------------------------------

        inserirTurma.run({

            id:
                String(turma.id),

            nome:
                String(turma.nome || "")

        });


        // ------------------------------
        // ELEIÇÃO
        // ------------------------------

        const eleicao =
            turma.eleicao || {};

        inserirEleicao.run({

            turma_id:
                String(turma.id),

            nome:
                String(
                    eleicao.nome || ""
                ),

            descricao:
                String(
                    eleicao.descricao || ""
                ),

            inicio:
                eleicao.inicio || null,

            fim:
                eleicao.fim || null,

            ativa:
                eleicao.ativa ? 1 : 0

        });


        // ------------------------------
        // ELEITORES
        // ------------------------------

        const eleitores =
            Array.isArray(
                turma.eleitores
            )
                ? turma.eleitores
                : [];


        for (
            const eleitor
            of eleitores
        ) {

            inserirEleitor.run({

                id:
                    String(eleitor.id),

                turma_id:
                    String(turma.id),

                nome:
                    String(
                        eleitor.nome || ""
                    ),

                cpf:
                    String(
                        eleitor.cpf || ""
                    ).replace(
                        /\D/g,
                        ""
                    ),

                votou:
                    eleitor.votou ? 1 : 0

            });

        }


        // ------------------------------
        // CHAPAS
        // ------------------------------

        const chapas =
            Array.isArray(
                turma.chapas
            )
                ? turma.chapas
                : [];


        for (
            const chapa
            of chapas
        ) {

            inserirChapa.run({

                id:
                    String(chapa.id),

                turma_id:
                    String(turma.id),

                numero:
                    String(
                        chapa.numero || ""
                    ),

                nome:
                    String(
                        chapa.nome || ""
                    ),

                representante:
                    String(
                        chapa.representante || ""
                    ),

                vice:
                    String(
                        chapa.vice || ""
                    ),

                descricao:
                    String(
                        chapa.descricao || ""
                    ),

                votos:
                    Number(
                        chapa.votos
                    ) || 0

            });

        }


        // ------------------------------
        // VOTOS
        // ------------------------------

        const votos =
            turma.votos || {};


        for (
            const eleitorId
            of Object.keys(votos)
        ) {

            const voto =
                votos[eleitorId];


            if (
                !voto ||
                !voto.chapaId ||
                !voto.data
            ) {

                continue;

            }


            inserirVoto.run({

                eleitor_id:
                    String(eleitorId),

                turma_id:
                    String(turma.id),

                chapa_id:
                    String(voto.chapaId),

                data:
                    String(voto.data)

            });

        }

    }

});


// ==========================================
// EXECUTAR
// ==========================================

try {

    migrar();

} catch (erro) {

    console.error("");
    console.error(
        "ERRO durante a migração:"
    );
    console.error(erro);
    console.error("");

    db.close();

    process.exit(1);

}


// ==========================================
// CONFERÊNCIA
// ==========================================

const totalTurmas =
    db.prepare(
        "SELECT COUNT(*) AS total FROM turmas"
    ).get().total;


const totalEleitores =
    db.prepare(
        "SELECT COUNT(*) AS total FROM eleitores"
    ).get().total;


const totalChapas =
    db.prepare(
        "SELECT COUNT(*) AS total FROM chapas"
    ).get().total;


const totalVotos =
    db.prepare(
        "SELECT COUNT(*) AS total FROM votos"
    ).get().total;


console.log("");

console.log(
    "=========================================="
);

console.log(
    "       MIGRAÇÃO CONCLUÍDA"
);

console.log(
    "=========================================="
);

console.log("");

console.log(
    `Turmas:     ${totalTurmas}`
);

console.log(
    `Eleitores:  ${totalEleitores}`
);

console.log(
    `Chapas:     ${totalChapas}`
);

console.log(
    `Votos:      ${totalVotos}`
);

console.log("");

console.log(
    `Banco criado em: ${arquivoBanco}`
);

console.log("");


// ==========================================
// FECHAR
// ==========================================

db.close();