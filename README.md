# Moa-Bot
[![NullDev/DiscordJS-Template](https://img.shields.io/badge/Template%3A-NullDev%2FDiscordJS--Template-green?style=flat-square&logo=github)](https://github.com/NullDev/DiscordJS-Template) [![Deployment](https://github.com/NullDev/Moa-Bot/actions/workflows/cd.yml/badge.svg)](https://github.com/NullDev/Moa-Bot/actions/workflows/cd.yml)

<p align="center"><img height="250" width="auto" src="/assets/icon.png" /></p>
<p align="center"><b>TUT Moa Bot</b></p>
<hr>

## :question: What does it do?

Discord bot for TUT Server. Math utils and daily integral helpers.

<hr>

## :diamond_shape_with_a_dot_inside: Feature requests & Issues

Feature request or discovered a bug? Please [open an Issue](https://github.com/NullDev/Moa-Bot/issues/new/choose) here on GitHub.

<hr>

## :wrench: Setup

0. Open up your favourite terminal (and navigate somewhere you want to download the repository to). <br><br>
1. Make sure you have NodeJS installed (>= v22.0.0). Test by entering <br>
$ `node -v` <br>
If this returns a version number, NodeJS is installed. **If not**, get NodeJS <a href="https://nodejs.org/en/download/package-manager/">here</a>. <br><br>
2. Clone the repository and navigate to it. If you have Git installed, type <br>
$ `git clone https://github.com/NullDev/Moa-Bot.git && cd Moa-Bot` <br>
If not, download it <a href="https://github.com/NullDev/Moa-Bot/archive/master.zip">here</a> and extract the ZIP file.<br>
Then navigate to the folder.<br><br>
3. Install all dependencies by typing <br>
$ `npm install`<br><br>
4. Copy [config/config.template.js](https://github.com/NullDev/Moa-Bot/blob/master/config/config.template.js) and paste it as `config/config.custom.js` OR use `npm run generate-config`. <br><br>
5. Configure it in your favourite editor by editing `config/config.custom.js`. <br><br>
6. [LINUX ONLY]: Install LaTeX dependencies: <br>
$ `sudo ./setup_latex.sh` <br><br>
7. Start it in development mode by running <br>
$ `npm start` <br>
or start in production mode <br>
$ `npm run start:prod` <br>
or (recommended), use PM2 <br>
$ `pm2 start pm2.ecosystem.json` <br><br>

<hr>

## :nut_and_bolt: Configuration

Once the config has been copied like described in [Step 4](#wrench-setup), it can be changed to your needs:

| Config Key | Description | Data Type | Default value |
| ---------- | --------- | ------------------ | ------------ |
| discord: <br> `bot_token` | Auth Token of the Discord bot. Can be created [here](https://discordapp.com/developers/). | String | N/A |
| discord: <br> `bot_owner_ids` | OPTIONAL: Discord IDs of Bot owners | String-Array | [] |
| discord: <br> `wolfram_appid` | OPTIONAL: Wolfram Alpha App ID | String | N/A |
| discord: <br> `total_shards` | Number of shards to use or "auto" for automatic sharding | number \| "auto" | 1 |
| ids: <br> `guild_id` | ID of the main server where special features are enabled | string | N/A |
| ids: <br> `daily_int_channel` | ID of the daily integral channel | string | N/A |
| ids: <br> `meme_channel` | ID of the meme channel | string | N/A |
| ids: <br> `general_channel` | ID of the general channel | string | N/A |
| ids: <br> `daily_int_role` | ID of the daily integral role | string | N/A |
| ids: <br> `moabot` | ID of the Moa Bot user | string | N/A |

<hr>
