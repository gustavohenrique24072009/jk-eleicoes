const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const Database = require("better-sqlite3");
const multer = require("multer");
require("dotenv").config();

const app = express();

const PORTA = process.env.PORT || 3000;


// ==========================================
// CONFIGURAÇÕES
// ==========================================

const ADMIN_SENHA =
    process.env.ADMIN_SENHA;

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "chave-temporaria-jk-eleicoes";


if (!ADMIN_SENHA) {

    console.error("");
    console.error(
        "ERRO: ADMIN_SENHA não foi configurada no arquivo .env"
    );
    console.error("");

    process.exit(1);
}


// ==========================================
// UPLOAD DE FOTOS DAS CHAPAS
// ==========================================

const pastaFotosChapas =
    path.join(
        __dirname,
        "..",
        "public",
        "uploads",
        "chapas"
    );


if (!fs.existsSync(pastaFotosChapas)) {

    fs.mkdirSync(
        pastaFotosChapas,
        {
            recursive: true
        }
    );

}


const armazenamentoFotos =
    multer.diskStorage({

        destination: function (
            req,
            arquivo,
            callback
        ) {

            callback(
                null,
                pastaFotosChapas
            );

        },

        filename: function (
            req,
            arquivo,
            callback
        ) {

            const extensao =
                path.extname(
                    arquivo.originalname
                ).toLowerCase();

            const nomeArquivo =
                `chapa-${Date.now()}-${Math.round(Math.random() * 100000)}${extensao}`;

            callback(
                null,
                nomeArquivo
            );

        }

    });


const uploadFotoChapa =
    multer({

        storage:
            armazenamentoFotos,

        limits: {

            fileSize:
                5 * 1024 * 1024

        },

        fileFilter:
            function (
                req,
                arquivo,
                callback
            ) {

                const tiposPermitidos = [

                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/gif"

                ];


                if (
                    tiposPermitidos.includes(
                        arquivo.mimetype
                    )
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            "TIPO_IMAGEM_INVALIDO"
                        )
                    );

                }

            }

    });


// ==========================================
// MIDDLEWARES
// ==========================================

app.use(
    express.json()
);


app.use(
    session({

        secret:
            SESSION_SECRET,

        resave:
            false,

        saveUninitialized:
            false,

        cookie: {

            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                false,

            maxAge:
                1000 * 60 * 60 * 4

        }

    })
);


// ==========================================
// ARQUIVOS PÚBLICOS
// ==========================================

app.use(
    express.static(
        path.join(
            __dirname,
            "..",
            "public"
        )
    )
);


// ==========================================
// BANCO DE DADOS SQLITE
// ==========================================

const pastaDados =
    path.join(
        __dirname,
        "dados"
    );


const arquivoBanco =
    path.join(
        pastaDados,
        "eleicoes.db"
    );


if (!fs.existsSync(pastaDados)) {

    fs.mkdirSync(
        pastaDados,
        {
            recursive: true
        }
    );

}


if (!fs.existsSync(arquivoBanco)) {

    console.error("");
    console.error(
        "ERRO: banco eleicoes.db não encontrado."
    );
    console.error(
        `Local esperado: ${arquivoBanco}`
    );
    console.error("");

    process.exit(1);

}


const db =
    new Database(
        arquivoBanco
    );


db.pragma(
    "foreign_keys = ON"
);


// ==========================================
// GARANTIR COLUNA FOTO NAS CHAPAS
// ==========================================

try {

    const colunasChapas =
        db.prepare(
            "PRAGMA table_info(chapas)"
        ).all();


    const possuiColunaFoto =
        colunasChapas.some(
            coluna =>
                coluna.name === "foto"
        );


    if (!possuiColunaFoto) {

        db.prepare(
            "ALTER TABLE chapas ADD COLUMN foto TEXT"
        ).run();

        console.log(
            "Coluna 'foto' adicionada à tabela chapas."
        );

    }

} catch (erro) {

    console.error(
        "Erro ao verificar a coluna foto:",
        erro
    );

    process.exit(1);

}


// ==========================================
// VERIFICAR BANCO
// ==========================================

try {

    db.prepare(
        "SELECT 1 FROM turmas LIMIT 1"
    ).get();

} catch (erro) {

    console.error("");
    console.error(
        "ERRO: o banco SQLite não está configurado corretamente."
    );
    console.error(
        "Verifique se a migração foi executada."
    );
    console.error("");
    console.error(erro);
    console.error("");

    process.exit(1);

}


// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function obterTurma(
    turmaId
) {

    return db.prepare(`
        SELECT
            id,
            nome
        FROM turmas
        WHERE id = ?
    `).get(
        turmaId
    );

}


function obterEleicao(
    turmaId
) {

    const eleicao =
        db.prepare(`
            SELECT
                turma_id,
                nome,
                descricao,
                inicio,
                fim,
                ativa
            FROM eleicoes
            WHERE turma_id = ?
        `).get(
            turmaId
        );


    if (!eleicao) {

        return null;

    }


    return {

        nome:
            eleicao.nome,

        descricao:
            eleicao.descricao,

        inicio:
            eleicao.inicio,

        fim:
            eleicao.fim,

        ativa:
            Boolean(
                eleicao.ativa
            )

    };

}


function obterEleitores(
    turmaId
) {

    const eleitores =
        db.prepare(`
            SELECT
                id,
                nome,
                cpf,
                votou
            FROM eleitores
            WHERE turma_id = ?
            ORDER BY nome
        `).all(
            turmaId
        );


    return eleitores.map(
        eleitor => ({

            id:
                eleitor.id,

            nome:
                eleitor.nome,

            cpf:
                eleitor.cpf,

            votou:
                Boolean(
                    eleitor.votou
                )

        })
    );

}


function obterChapas(
    turmaId
) {

    return db.prepare(`
        SELECT
            id,
            numero,
            nome,
            representante,
            vice,
            descricao,
            foto,
            votos
        FROM chapas
        WHERE turma_id = ?
        ORDER BY CAST(numero AS INTEGER), numero
    `).all(
        turmaId
    );

}


function obterVotos(
    turmaId
) {

    const votos =
        db.prepare(`
            SELECT
                eleitor_id,
                chapa_id,
                data
            FROM votos
            WHERE turma_id = ?
        `).all(
            turmaId
        );


    const resultado = {};


    for (
        const voto
        of votos
    ) {

        resultado[
            voto.eleitor_id
        ] = {

            chapaId:
                voto.chapa_id,

            data:
                voto.data

        };

    }


    return resultado;

}


function obterTurmaCompleta(
    turmaId
) {

    const turma =
        obterTurma(
            turmaId
        );


    if (!turma) {

        return null;

    }


    return {

        id:
            turma.id,

        nome:
            turma.nome,

        eleitores:
            obterEleitores(
                turmaId
            ),

        chapas:
            obterChapas(
                turmaId
            ),

        eleicao:
            obterEleicao(
                turmaId
            ) || {

                nome: "",

                descricao: "",

                inicio: null,

                fim: null,

                ativa: false

            },

        votos:
            obterVotos(
                turmaId
            )

    };

}


function obterTodasTurmasCompletas() {

    const turmas =
        db.prepare(`
            SELECT
                id,
                nome
            FROM turmas
            ORDER BY nome
        `).all();


    return turmas.map(
        turma =>
            obterTurmaCompleta(
                turma.id
            )
    );

}


// ==========================================
// AUTENTICAÇÃO ADMINISTRATIVA
// ==========================================

function exigirAdmin(
    req,
    res,
    next
) {

    if (
        req.session &&
        req.session.admin === true
    ) {

        return next();

    }


    return res.status(401).json({

        sucesso:
            false,

        mensagem:
            "Acesso administrativo não autorizado."

    });

}


// ==========================================
// LOGIN
// ==========================================

app.get(
    "/api/admin/sessao",
    (req, res) => {

        res.json({

            autenticado:
                req.session &&
                req.session.admin === true

        });

    }
);


app.post(
    "/api/admin/login",
    (req, res) => {

        const senha =
            String(
                req.body.senha || ""
            );


        if (!senha) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe a senha."

            });

        }


        if (
            senha !== ADMIN_SENHA
        ) {

            return res.status(401).json({

                sucesso:
                    false,

                mensagem:
                    "Senha incorreta."

            });

        }


        req.session.admin =
            true;


        res.json({

            sucesso:
                true,

            mensagem:
                "Login realizado com sucesso."

        });

    }
);


app.post(
    "/api/admin/logout",
    exigirAdmin,
    (req, res) => {

        req.session.destroy(
            erro => {

                if (erro) {

                    console.error(
                        "Erro ao encerrar sessão:",
                        erro
                    );

                    return res.status(500).json({

                        sucesso:
                            false,

                        mensagem:
                            "Não foi possível sair."

                    });

                }


                res.json({

                    sucesso:
                        true,

                    mensagem:
                        "Sessão encerrada."

                });

            }
        );

    }
);


// ==========================================
// TURMAS PÚBLICAS
// ==========================================

app.get(
    "/api/turmas",
    (req, res) => {

        const turmas =
            db.prepare(`
                SELECT
                    id,
                    nome
                FROM turmas
                ORDER BY nome
            `).all();


        res.json({

            sucesso:
                true,

            turmas:
                turmas

        });

    }
);


// ==========================================
// TURMAS ADMINISTRATIVAS
// ==========================================

app.get(
    "/api/admin/turmas",
    exigirAdmin,
    (req, res) => {

        const turmas =
            obterTodasTurmasCompletas();


        res.json({

            sucesso:
                true,

            turmas:
                turmas

        });

    }
);


// ==========================================
// CRIAR TURMA
// ==========================================

app.post(
    "/api/turmas",
    exigirAdmin,
    (req, res) => {

        const nome =
            String(
                req.body.nome || ""
            ).trim();


        const letra =
            String(
                req.body.letra || ""
            ).trim();


        if (!nome) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o nome da turma."

            });

        }


        const nomeCompleto =
            letra
                ? `${nome}`
                : nome;


        const existente =
            db.prepare(`
                SELECT
                    id
                FROM turmas
                WHERE LOWER(nome) = LOWER(?)
            `).get(
                nomeCompleto
            );


        if (existente) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Essa turma já está cadastrada."

            });

        }


        const novaTurmaId =
            Date.now().toString();


        const criarTurma =
            db.transaction(() => {

                db.prepare(`
                    INSERT INTO turmas (
                        id,
                        nome
                    )
                    VALUES (
                        ?,
                        ?
                    )
                `).run(

                    novaTurmaId,

                    nomeCompleto

                );


                db.prepare(`
                    INSERT INTO eleicoes (
                        turma_id,
                        nome,
                        descricao,
                        inicio,
                        fim,
                        ativa
                    )
                    VALUES (
                        ?,
                        '',
                        '',
                        NULL,
                        NULL,
                        0
                    )
                `).run(
                    novaTurmaId
                );

            });


        try {

            criarTurma();

        } catch (erro) {

            console.error(
                "Erro ao criar turma:",
                erro
            );

            return res.status(500).json({

                sucesso:
                    false,

                mensagem:
                    "Não foi possível criar a turma."

            });

        }


        res.status(201).json({

            sucesso:
                true,

            mensagem:
                "Turma criada com sucesso.",

            turma:
                obterTurmaCompleta(
                    novaTurmaId
                )

        });

    }
);


// ==========================================
// EXCLUIR TURMA
// ==========================================

app.delete(
    "/api/turmas/:turmaId",
    exigirAdmin,
    (req, res) => {

        const turmaId =
            req.params.turmaId;


        const turma =
            obterTurma(
                turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        try {

            db.prepare(`
                DELETE FROM turmas
                WHERE id = ?
            `).run(
                turmaId
            );


            res.json({

                sucesso:
                    true,

                mensagem:
                    `A turma "${turma.nome}" foi excluída com sucesso.`

            });

        } catch (erro) {

            console.error(
                "Erro ao excluir turma:",
                erro
            );

            res.status(500).json({

                sucesso:
                    false,

                mensagem:
                    "Não foi possível excluir a turma."

            });

        }

    }
);


// ==========================================
// ELEITORES
// ==========================================

app.get(
    "/api/turmas/:turmaId/eleitores",
    exigirAdmin,
    (req, res) => {

        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        res.json({

            sucesso:
                true,

            eleitores:
                obterEleitores(
                    req.params.turmaId
                )

        });

    }
);


app.post(
    "/api/turmas/:turmaId/eleitores",
    exigirAdmin,
    (req, res) => {

        const nome =
            String(
                req.body.nome || ""
            ).trim();


        const cpf =
            String(
                req.body.cpf || ""
            ).replace(
                /\D/g,
                ""
            );


        if (!nome) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o nome do eleitor."

            });

        }


        if (cpf.length !== 11) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe um CPF válido."

            });

        }


        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const cpfExistente =
            db.prepare(`
                SELECT
                    id
                FROM eleitores
                WHERE cpf = ?
            `).get(
                cpf
            );


        if (cpfExistente) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Este CPF já está cadastrado."

            });

        }


        const novoEleitorId =
            Date.now().toString();


        try {

            db.prepare(`
                INSERT INTO eleitores (
                    id,
                    turma_id,
                    nome,
                    cpf,
                    votou
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    0
                )
            `).run(

                novoEleitorId,

                req.params.turmaId,

                nome,

                cpf

            );

        } catch (erro) {

            console.error(
                "Erro ao cadastrar eleitor:",
                erro
            );

            return res.status(500).json({

                sucesso:
                    false,

                mensagem:
                    "Não foi possível cadastrar o eleitor."

            });

        }


        res.status(201).json({

            sucesso:
                true,

            mensagem:
                "Eleitor cadastrado com sucesso.",

            eleitor: {

                id:
                    novoEleitorId,

                nome:
                    nome,

                votou:
                    false

            }

        });

    }
);


// ==========================================
// CHAPAS
// ==========================================

// LISTAR CHAPAS
//
// ATENÇÃO:
// Esta rota precisa ser GET.
// A versão anterior estava como POST.

app.get(
    "/api/turmas/:turmaId/chapas",
    exigirAdmin,
    (req, res) => {

        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        res.json({

            sucesso:
                true,

            chapas:
                obterChapas(
                    req.params.turmaId
                )

        });

    }
);


// ==========================================
// CADASTRAR CHAPA COM FOTO
// ==========================================

app.post(
    "/api/turmas/:turmaId/chapas",
    exigirAdmin,
    uploadFotoChapa.single("foto"),
    (req, res) => {

        const numero =
            String(
                req.body.numero || ""
            ).trim();


        const nome =
            String(
                req.body.nome || ""
            ).trim();


        const representante =
            String(
                req.body.representante || ""
            ).trim();


        const vice =
            String(
                req.body.vice || ""
            ).trim();


        const descricao =
            String(
                req.body.descricao || ""
            ).trim();


        const foto =
            req.file
                ? `/uploads/chapas/${req.file.filename}`
                : null;


        if (!numero) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o número da chapa."

            });

        }


        if (!nome) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o nome da chapa."

            });

        }


        if (!representante) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o representante."

            });

        }


        if (!vice) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o vice-representante."

            });

        }


        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const numeroExistente =
            db.prepare(`
                SELECT
                    id
                FROM chapas
                WHERE turma_id = ?
                AND numero = ?
            `).get(

                req.params.turmaId,

                numero

            );


        if (numeroExistente) {

            apagarFotoSeNecessario(
                req.file
            );

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Já existe uma chapa com este número nesta turma."

            });

        }


        const novaChapaId =
            Date.now().toString();


        try {

            db.prepare(`
                INSERT INTO chapas (
                    id,
                    turma_id,
                    numero,
                    nome,
                    representante,
                    vice,
                    descricao,
                    foto,
                    votos
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    0
                )
            `).run(

                novaChapaId,

                req.params.turmaId,

                numero,

                nome,

                representante,

                vice,

                descricao,

                foto

            );

        } catch (erro) {

            apagarFotoSeNecessario(
                req.file
            );

            console.error(
                "Erro ao cadastrar chapa:",
                erro
            );

            return res.status(500).json({

                sucesso:
                    false,

                mensagem:
                    "Não foi possível cadastrar a chapa."

            });

        }


        const novaChapa =
            db.prepare(`
                SELECT
                    id,
                    numero,
                    nome,
                    representante,
                    vice,
                    descricao,
                    foto,
                    votos
                FROM chapas
                WHERE id = ?
            `).get(
                novaChapaId
            );


        res.status(201).json({

            sucesso:
                true,

            mensagem:
                "Chapa cadastrada com sucesso.",

            chapa:
                novaChapa

        });

    }
);


// ==========================================
// ELEIÇÃO
// ==========================================

app.get(
    "/api/turmas/:turmaId/eleicao",
    exigirAdmin,
    (req, res) => {

        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        let eleicao =
            obterEleicao(
                req.params.turmaId
            );


        if (!eleicao) {

            db.prepare(`
                INSERT INTO eleicoes (
                    turma_id,
                    nome,
                    descricao,
                    inicio,
                    fim,
                    ativa
                )
                VALUES (
                    ?,
                    '',
                    '',
                    NULL,
                    NULL,
                    0
                )
            `).run(
                req.params.turmaId
            );


            eleicao =
                obterEleicao(
                    req.params.turmaId
                );

        }


        res.json({

            sucesso:
                true,

            eleicao:
                eleicao

        });

    }
);


app.put(
    "/api/turmas/:turmaId/eleicao",
    exigirAdmin,
    (req, res) => {

        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const nome =
            String(
                req.body.nome || ""
            ).trim();


        const descricao =
            String(
                req.body.descricao || ""
            ).trim();


        const inicio =
            req.body.inicio || null;


        const fim =
            req.body.fim || null;


        const ativa =
            req.body.ativa === true;


        if (!nome) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe o nome da eleição."

            });

        }


        if (!inicio) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe a data e hora de início."

            });

        }


        if (!fim) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe a data e hora de encerramento."

            });

        }


        const dataInicio =
            new Date(
                inicio
            );


        const dataFim =
            new Date(
                fim
            );


        if (
            Number.isNaN(
                dataInicio.getTime()
            ) ||
            Number.isNaN(
                dataFim.getTime()
            )
        ) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Data ou hora inválida."

            });

        }


        if (
            dataFim <= dataInicio
        ) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "O encerramento deve ser depois do início."

            });

        }


        db.prepare(`
            INSERT INTO eleicoes (
                turma_id,
                nome,
                descricao,
                inicio,
                fim,
                ativa
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
            )
            ON CONFLICT(turma_id)
            DO UPDATE SET

                nome =
                    excluded.nome,

                descricao =
                    excluded.descricao,

                inicio =
                    excluded.inicio,

                fim =
                    excluded.fim,

                ativa =
                    excluded.ativa
        `).run(

            req.params.turmaId,

            nome,

            descricao,

            inicio,

            fim,

            ativa
                ? 1
                : 0

        );


        res.json({

            sucesso:
                true,

            mensagem:
                ativa
                    ? "Eleição ativada com sucesso."
                    : "Eleição salva como inativa.",

            eleicao:
                obterEleicao(
                    req.params.turmaId
                )

        });

    }
);


// ==========================================
// VOTAÇÃO
// ==========================================

// IDENTIFICAR ELEITOR

app.post(
    "/api/turmas/:turmaId/identificar-eleitor",
    (req, res) => {

        const cpf =
            String(
                req.body.cpf || ""
            ).replace(
                /\D/g,
                ""
            );


        if (cpf.length !== 11) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Informe um CPF válido."

            });

        }


        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const eleitor =
            db.prepare(`
                SELECT
                    id,
                    nome,
                    votou
                FROM eleitores
                WHERE turma_id = ?
                AND cpf = ?
            `).get(

                req.params.turmaId,

                cpf

            );


        if (!eleitor) {

            return res.status(401).json({

                sucesso:
                    false,

                mensagem:
                    "Eleitor não encontrado nesta turma."

            });

        }


        if (
            Boolean(
                eleitor.votou
            )
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                mensagem:
                    "Este eleitor já registrou seu voto."

            });

        }


        res.json({

            sucesso:
                true,

            eleitor: {

                id:
                    eleitor.id,

                nome:
                    eleitor.nome

            },

            chapas:
                obterChapas(
                    req.params.turmaId
                ),

            eleicao:
                obterEleicao(
                    req.params.turmaId
                )

        });

    }
);


// ==========================================
// REGISTRAR VOTO
// ==========================================

app.post(
    "/api/turmas/:turmaId/votar",
    (req, res) => {

        const eleitorId =
            String(
                req.body.eleitorId || ""
            ).trim();


        const chapaId =
            String(
                req.body.chapaId || ""
            ).trim();


        if (!eleitorId) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Eleitor não informado."

            });

        }


        if (!chapaId) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Chapa não informada."

            });

        }


        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const eleicao =
            obterEleicao(
                req.params.turmaId
            );


        if (!eleicao) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Esta turma não possui uma eleição configurada."

            });

        }


        if (!eleicao.ativa) {

            return res.status(403).json({

                sucesso:
                    false,

                mensagem:
                    "A eleição desta turma não está ativa."

            });

        }


        const agora =
            new Date();


        const inicio =
            new Date(
                eleicao.inicio
            );


        const fim =
            new Date(
                eleicao.fim
            );


        if (
            Number.isNaN(
                inicio.getTime()
            ) ||
            Number.isNaN(
                fim.getTime()
            )
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                mensagem:
                    "O período da eleição não está configurado corretamente."

            });

        }


        if (
            agora < inicio ||
            agora > fim
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                mensagem:
                    "A eleição não está dentro do período de votação."

            });

        }


        const eleitor =
            db.prepare(`
                SELECT
                    id,
                    nome,
                    votou
                FROM eleitores
                WHERE id = ?
                AND turma_id = ?
            `).get(

                eleitorId,

                req.params.turmaId

            );


        if (!eleitor) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Eleitor não encontrado."

            });

        }


        if (
            Boolean(
                eleitor.votou
            )
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                mensagem:
                    "Este eleitor já votou."

            });

        }


        const chapa =
            db.prepare(`
                SELECT
                    id,
                    numero,
                    nome,
                    representante,
                    vice,
                    descricao,
                    foto,
                    votos
                FROM chapas
                WHERE id = ?
                AND turma_id = ?
            `).get(

                chapaId,

                req.params.turmaId

            );


        if (!chapa) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Chapa não encontrada."

            });

        }


        try {

            const registrarVoto =
                db.transaction(() => {

                    const eleitorAtual =
                        db.prepare(`
                            SELECT
                                votou
                            FROM eleitores
                            WHERE id = ?
                            AND turma_id = ?
                        `).get(

                            eleitorId,

                            req.params.turmaId

                        );


                    if (!eleitorAtual) {

                        throw new Error(
                            "ELEITOR_NAO_ENCONTRADO"
                        );

                    }


                    if (
                        Boolean(
                            eleitorAtual.votou
                        )
                    ) {

                        throw new Error(
                            "ELEITOR_JA_VOTOU"
                        );

                    }


                    const agoraVoto =
                        new Date()
                            .toISOString();


                    db.prepare(`
                        UPDATE eleitores
                        SET votou = 1
                        WHERE id = ?
                        AND turma_id = ?
                        AND votou = 0
                    `).run(

                        eleitorId,

                        req.params.turmaId

                    );


                    db.prepare(`
                        UPDATE chapas
                        SET votos = votos + 1
                        WHERE id = ?
                        AND turma_id = ?
                    `).run(

                        chapaId,

                        req.params.turmaId

                    );


                    db.prepare(`
                        INSERT INTO votos (
                            eleitor_id,
                            turma_id,
                            chapa_id,
                            data
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?
                        )
                    `).run(

                        eleitorId,

                        req.params.turmaId,

                        chapaId,

                        agoraVoto

                    );

                });


            registrarVoto();


        } catch (erro) {

            if (
                erro.message ===
                "ELEITOR_JA_VOTOU"
            ) {

                return res.status(403).json({

                    sucesso:
                        false,

                    mensagem:
                        "Este eleitor já votou."

                });

            }


            if (
                erro.message ===
                "ELEITOR_NAO_ENCONTRADO"
            ) {

                return res.status(404).json({

                    sucesso:
                        false,

                    mensagem:
                        "Eleitor não encontrado."

                });

            }


            if (
                erro.code ===
                "SQLITE_CONSTRAINT_PRIMARYKEY"
            ) {

                return res.status(403).json({

                    sucesso:
                        false,

                    mensagem:
                        "Este eleitor já registrou um voto."

                });

            }


            console.error(
                "Erro ao registrar voto:",
                erro
            );

            return res.status(500).json({

                sucesso:
                    false,

                mensagem:
                    "Não foi possível registrar o voto."

            });

        }


        res.json({

            sucesso:
                true,

            mensagem:
                "Voto registrado com sucesso."

        });

    }
);

// ==========================================
// RESULTADOS ADMINISTRATIVOS
// ==========================================

// O administrador pode visualizar a apuração
// mesmo enquanto a eleição estiver ativa.

app.get(
    "/api/admin/turmas/:turmaId/resultados",
    exigirAdmin,
    (req, res) => {

        const turmaId =
            req.params.turmaId;


        const turma =
            obterTurma(
                turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const eleicao =
            obterEleicao(
                turmaId
            );


        const chapas =
            obterChapas(
                turmaId
            );


        const totalEleitores =
            db.prepare(`
                SELECT
                    COUNT(*) AS total
                FROM eleitores
                WHERE turma_id = ?
            `).get(
                turmaId
            ).total;


        const totalVotos =
            db.prepare(`
                SELECT
                    COUNT(*) AS total
                FROM votos
                WHERE turma_id = ?
            `).get(
                turmaId
            ).total;


        const resultados =
            chapas.map(
                chapa => {

                    const votos =
                        Number(
                            chapa.votos
                        ) || 0;


                    const porcentagem =
                        totalVotos > 0

                            ? (
                                votos /
                                totalVotos
                            ) * 100

                            : 0;


                    return {

                        id:
                            chapa.id,

                        numero:
                            chapa.numero,

                        nome:
                            chapa.nome,

                        representante:
                            chapa.representante,

                        vice:
                            chapa.vice,

                        descricao:
                            chapa.descricao,

                        foto:
                            chapa.foto,

                        votos:
                            votos,

                        porcentagem:
                            Number(
                                porcentagem.toFixed(2)
                            )

                    };

                }
            );


        res.json({

            sucesso:
                true,

            resultadosDisponiveis:
                true,

            encerrada:
                eleicao
                    ? (
                        eleicao.fim &&
                        new Date() >
                        new Date(
                            eleicao.fim
                        )
                    )
                    : false,

            turma: {

                id:
                    turma.id,

                nome:
                    turma.nome

            },

            eleicao:
                eleicao,

            totalEleitores:
                Number(
                    totalEleitores
                ) || 0,

            totalVotos:
                Number(
                    totalVotos
                ) || 0,

            resultados:
                resultados

        });

    }
);
// ==========================================
// RESULTADOS PÚBLICOS
// ==========================================

app.get(
    "/api/turmas/:turmaId/resultados",
    (req, res) => {

        const turma =
            obterTurma(
                req.params.turmaId
            );


        if (!turma) {

            return res.status(404).json({

                sucesso:
                    false,

                mensagem:
                    "Turma não encontrada."

            });

        }


        const eleicao =
            obterEleicao(
                req.params.turmaId
            );


        if (!eleicao) {

            return res.status(403).json({

                sucesso:
                    false,

                resultadosDisponiveis:
                    false,

                mensagem:
                    "A eleição desta turma ainda não foi configurada."

            });

        }


        const agora =
            new Date();


        const fim =
            new Date(
                eleicao.fim
            );


        if (
            !eleicao.fim ||
            Number.isNaN(
                fim.getTime()
            )
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                resultadosDisponiveis:
                    false,

                mensagem:
                    "A apuração ainda não está disponível."

            });

        }


        if (
            agora <= fim
        ) {

            return res.status(403).json({

                sucesso:
                    false,

                resultadosDisponiveis:
                    false,

                mensagem:
                    "Os resultados serão disponibilizados após o encerramento da eleição."

            });

        }


        const chapas =
            obterChapas(
                req.params.turmaId
            );


        const totalEleitores =
            db.prepare(`
                SELECT
                    COUNT(*) AS total
                FROM eleitores
                WHERE turma_id = ?
            `).get(
                req.params.turmaId
            ).total;


        const totalVotos =
            db.prepare(`
                SELECT
                    COUNT(*) AS total
                FROM votos
                WHERE turma_id = ?
            `).get(
                req.params.turmaId
            ).total;


        const resultados =
            chapas.map(
                chapa => {

                    const votos =
                        Number(
                            chapa.votos
                        ) || 0;


                    const porcentagem =
                        totalVotos > 0

                            ? (
                                votos /
                                totalVotos
                            ) * 100

                            : 0;


                    return {

                        id:
                            chapa.id,

                        numero:
                            chapa.numero,

                        nome:
                            chapa.nome,

                        representante:
                            chapa.representante,

                        vice:
                            chapa.vice,

                        descricao:
                            chapa.descricao,

                        foto:
                            chapa.foto,

                        votos:
                            votos,

                        porcentagem:
                            Number(
                                porcentagem.toFixed(2)
                            )

                    };

                }
            );


        const resultadosOrdenados =
            [...resultados].sort(
                (a, b) =>
                    b.votos - a.votos
            );


        const chapaEleita =
            resultadosOrdenados.length > 0
                ? resultadosOrdenados[0]
                : null;


        res.json({

            sucesso:
                true,

            resultadosDisponiveis:
                true,

            encerrada:
                true,

            turma: {

                id:
                    turma.id,

                nome:
                    turma.nome

            },

            eleicao:
                eleicao,

            totalEleitores:
                totalEleitores,

            totalVotos:
                totalVotos,

            chapaEleita:
                chapaEleita,

            resultados:
                resultados

        });

    }
);


// ==========================================
// ERROS DO MULTER / UPLOAD
// ==========================================

app.use(
    (erro, req, res, next) => {

        if (
            erro &&
            erro.message ===
            "TIPO_IMAGEM_INVALIDO"
        ) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "Selecione uma imagem JPG, PNG, WEBP ou GIF."

            });

        }


        if (
            erro instanceof multer.MulterError &&
            erro.code ===
            "LIMIT_FILE_SIZE"
        ) {

            return res.status(400).json({

                sucesso:
                    false,

                mensagem:
                    "A imagem deve ter no máximo 5 MB."

            });

        }


        console.error(
            "Erro no servidor:",
            erro
        );


        res.status(500).json({

            sucesso:
                false,

            mensagem:
                "Erro interno do servidor."

        });

    }
);


// ==========================================
// FUNÇÃO PARA APAGAR FOTO EM CASO DE ERRO
// ==========================================

function apagarFotoSeNecessario(
    arquivo
) {

    if (
        !arquivo ||
        !arquivo.path
    ) {

        return;

    }


    try {

        if (
            fs.existsSync(
                arquivo.path
            )
        ) {

            fs.unlinkSync(
                arquivo.path
            );

        }

    } catch (erro) {

        console.error(
            "Não foi possível apagar a foto:",
            erro
        );

    }

}


// ==========================================
// ENCERRAMENTO
// ==========================================

process.on(
    "SIGINT",
    () => {

        console.log("");
        console.log(
            "Encerrando servidor..."
        );

        db.close();

        process.exit(0);

    }
);


process.on(
    "SIGTERM",
    () => {

        db.close();

        process.exit(0);

    }
);


// ==========================================
// SERVIDOR
// ==========================================

app.listen(
    PORTA,
    () => {

        console.log("");

        console.log(
            "===================================="
        );

        console.log(
            "       ELEIÇÕES JK - SERVIDOR"
        );

        console.log(
            "===================================="
        );

        console.log("");

        console.log(
            "Banco de dados: SQLite"
        );

        console.log(
            "Upload de fotos: Ativo"
        );

        console.log(
            `Servidor rodando em: http://localhost:${PORTA}`
        );

        console.log("");

    }
);