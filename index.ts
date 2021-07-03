import * as path from "path";
const util = require("util");
const exec = util.promisify(require('child_process').exec);
const express = require("express")

function loadConfig() {
    const cfg = path.resolve(process.argv[2] || "config.json");

    try {
        return require(cfg);
    } catch (err) {
        console.error(`Configuration error - configuration file located at ${cfg} not found or malformed JSON.`)
        process.exit(1);
    }
}

const config = loadConfig();

/**
 * Gets the active branch (e.g. master)
 * @param repo
 */
async function getActiveBranch(repo: string): Promise<string|null> {
    try {
        const {stdout, stderr} = await exec(`cd ${repo} && git rev-parse --abbrev-ref HEAD`).catch((e) => {
            console.log(e)
        });
        return stdout.trim();
    } catch (e) {
        return null;
    }
}

/**
 * Gets the name of the upstream branch (e.g. origin/master)
 * @param repo
 */
async function getUpstreamBranch(repo: string): Promise<string|null> {
    const {stdout, stderr} = await exec(`cd ${repo} && git rev-parse --abbrev-ref --symbolic-full-name @{u}`).catch((e) => {
        console.log(e)
    });
    return stdout.trim();
}

/**
 * Gets the remote URL
 * @param repo
 */
async function getRemoteURL(repo: string): Promise<string|null> {
    const upstream = await getUpstreamBranch(repo);
    const {stdout, stderr} = await exec(`cd ${repo} && git config --get remote.${upstream.split('/')[0]}.url`);
    return stdout.trim();
}

/**
 * Exec git pull
 * @param repo
 */
async function pull(repo: string): Promise<object> {
    return exec(`cd ${repo} && git pull`);
}

const app = express()

app.use(express.json())

app.listen(config.express.port, config.express.host, () => {
    console.log(`App server listening at ${config.express.host}:${config.express.port}`)
});

async function configure() {
    for (const id in config.hooks) {
        const hook = config.hooks[id];
        const branch = await getActiveBranch(hook.path);

        if (!branch) {
            console.error(`could not resolve active branch for ${hook.path}; configuration will be skipped.`)
            continue;
        }

        app.post(`/hooks/${id}`, async (req, res) => {
            res.sendStatus(200);

            console.log(req.body);
            console.log(`Executing git pull for ${hook.path}`)

            pull(hook.path).then((result: object) => {
                console.log(result);
            }).catch();

        })

        console.log(`[/hooks/${id}] ${hook.path}:${await getActiveBranch(hook.path)} -> ${await getRemoteURL(hook.path)}:${await getUpstreamBranch(hook.path)}`)
    }
}

configure()

