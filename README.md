# Charbot
An slackbot for choosing someone to review code, created by and for the web apps team at FiscalNote

### Testing your changes locally
 1. Make sure you have forever installed `npm install -g forever` (Node v6.4)
 2. Run `token=<yourAPItoken> channel=may_test forever start node index.js`
This will allow you to test charbot's functionality in the channel may_test (or you can create another test channel, and use that instead)

### Deploying
Once you've made a pull request and merged:
 1. If this is the first time you're making changes, ask INF to make an account for you on `52.3.250.141`
 2. Ssh into that account `ssh <yourUser>@52.3.250.141`
 3. `sudo su` and enter your password
 4. `cd slackbot-helper`
 5. Pull in your changes `git pull`
 6. Restart the script to apply your changes:
```
// FN: if you reverse search (Ctrl+R) forever stopall on the server, you'll see the token
forever stopall && token=<yourAPItoken> channel=firebenderzzz forever start index.js
```
