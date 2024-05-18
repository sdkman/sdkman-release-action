const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios')


async function main(){

    const consumer_key = core.getInput('CONSUMER-KEY')
    const consumer_token = core.getInput('CONSUMER-KEY')
    const candidate = core.getInput('CANDIDATE')
    const version = core.getInput('VERSION')
    const url = core.getInput('URL')
    const backend = core.getInput('BACKEND')

    const payload = {
        candidate: candidate,
        version: version,
        url: url
    }

    const query_config = {
        method: 'POST',
        url: `${backend}/release`,
        headers: {
            'Consumer-Key': consumer_key,
            'Consumer-Token': consumer_token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        data : payload
    }

    const response = await axios(query_config)

    console.log(response.data)
}

await main()
