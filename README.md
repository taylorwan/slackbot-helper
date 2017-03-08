# Charbot
An slackbot for choosing someone to review code, created by and for the web apps team at FiscalNote

### Testing your changes locally
Run `token=<yourAPItoken> channel=may_test node index.js`
This will allow you to test charbot's functionality in the channel may_test (or you can create another test channel, and use that instead)

### Deploying
Once you've made a pull request and merged:
 1. If this is the first time you're making changes, ask INF to make an account for you on `54.80.204.139`
 2. Ssh into that account `ssh <yourUser>@54.80.204.139`
 3. `sudo su` and enter your password
 4. `cd slackbot-helper`
 5. Fetch and pull in your changes `git fetch` and `git pull`
 6. Restart the script to apply your changes:
```
// FN: if you reverse search (Ctrl+R) forever stopall on the server, you'll see the token
forever stopall && token=<yourAPItoken> channel=firebenderzzz forever start index.js
```
