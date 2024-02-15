import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure.js";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings = {
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

/* Grammar definition */
const grammar = {
  vlad: { person: "Vladislav Maraev" },
  aya: { person: "Nayat Astaiza Soriano" },
  rasmus: { person: "Rasmus Blanck" },
  ben: { person: "Ben Test" },
  jack: { person: "Jack Test" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  yes: { response: "positive" },
  no: { response: "negative" },
  ofCourse: { response: "positive" },
  noWay: { response: "negative" },
};

/* Helper functions */
function isInGrammar(utterance) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

function getDay(utterance){
  return (grammar[utterance.toLowerCase()] || {}).day;
}

function getTime(utterance){
  return (grammar[utterance.toLowerCase()] || {}).time;
}

const dmMachine = setup({
  actions: {
    Say:({ context }, value) =>
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: value,
        },
      }),
  },
}).createMachine({
  context: {
    person: null,
    day: null,
    time: 0,
  },
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: [
        assign({
          ssRef: ({ spawn }) => spawn(speechstate, { input: settings }),
        }),
        ({ context }) => context.ssRef.send({ type: "PREPARE" }),
      ],
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: {
        CLICK: "PromptAndAsk",
      },
    },
    PromptAndAsk: {
      initial: "Prompt",
      states: {
        Prompt: {
          entry: [{
            type: "Say",
            params: `Hi! Let's create an appointment.Shall we?`,
          }],
          on: { SPEAK_COMPLETE: "FirstListen" },
        },
        FirstListen: {
          entry: ({ context }) =>
            context.ssRef.send({
              type: "LISTEN", value:{completeTimeout: 5}
            }),
          on: {
            RECOGNISED: [
              {target: "FirstQuestion",
              guard: ({ event }) => 
                {const recognizedUtterance = event.value[0]?.utterance;
                return (
                  recognizedUtterance &&
                  isInGrammar(recognizedUtterance) && 
                  grammar[recognizedUtterance.toLowerCase()].response === 'positive'
                );
                },
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not an expected answer in the grammar, please say yes`,
                },
              }),
              target: "Prompt",
              },
            ],
          },
        },
        FirstQuestion: {
          entry: [{
            type: "Say",
            params: `Who are you meeting with?`,
          }], 
          on: { SPEAK_COMPLETE: "SecondListen" },
        },
        SecondListen:{
          entry: ({ context }) =>
          context.ssRef.send({
            type: "LISTEN", value:{completeTimeout: 5}
          }),
          on:{
            RECOGNISED: [{
              target: "SecondQuestion",
              guard: ({ context, event }) => 
                {const recognizedUtterance = event.value[0]?.utterance;
                context.name = recognizedUtterance;
                return (
                  recognizedUtterance &&
                  isInGrammar(recognizedUtterance) && 
                  grammar[recognizedUtterance.toLowerCase()].person
                );
                },
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not a name in the grammar, please try again with a name.`,
                },
              }),
              target: "FirstQuestion",
              }
            ],
          },
        },
        SecondQuestion: {
          entry:[{
            type: "Say",
            params: `On which day is your meeting?`,
          }],
          on: { SPEAK_COMPLETE: "ThirdListen" },
        },
        ThirdListen: {
          entry: ({ context }) =>
          context.ssRef.send({
            type: "LISTEN", value:{completeTimeout: 5}
          }),
          on:{
            RECOGNISED: [{
              guard:({ context,event }) => 
                {const recognizedday = event.value[0]?.utterance;
                context.day = recognizedday;
                return (
                  recognizedday &&
                  isInGrammar(recognizedday) && 
                  grammar[recognizedday.toLowerCase()].day
                );
                },
              target: "ThirdQuestion",
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not a day in the grammar, please try again with a day.`,
                },
              }),
              target: "SecondQuestion",
              }
            ],
          },
        },
        ThirdQuestion: {
          entry:[{
            type: "Say",
            params: `Will it take the whole day? Answer with yes or no please.`,
          }],
          on: { SPEAK_COMPLETE: "FourthListen" },
        },
        FourthListen:{
          entry: ({ context }) =>
          context.ssRef.send({
            type: "LISTEN", value:{completeTimeout: 5}
          }),
          on:{
            RECOGNISED: [
              {target: "LastQuestion",
              guard: ({ event }) => 
                {const answer = event.value[0]?.utterance;
                  return (
                  answer &&
                  isInGrammar(answer) && 
                  grammar[answer.toLowerCase()].response === 'positive'
                );
                },
              },
              {target: "FifthQuestion",
              guard: ({ event }) => 
                {const answer = event.value[0]?.utterance;
                return (
                  answer &&
                  isInGrammar(answer) && 
                  grammar[answer.toLowerCase()].response === 'negative'
                );
                },
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not an expected answer in the grammar, please try again with yes or no`,
                },
              }),
              target: "ThirdQuestion",
              }
            ],
          },
        },
        FifthQuestion: {
          entry:[{
            type: "Say",
            params: `What time is your meeting?`,
          }],
          on: { SPEAK_COMPLETE: "FifthListen" },
        },
        FifthListen: {
          entry: ({ context }) =>
          context.ssRef.send({
            type: "LISTEN", value:{completeTimeout: 5}
          }),
          on:{
            RECOGNISED: [
              {target: "SixthQuestion",
              guard: ({ context,event }) => 
                {const recognizedtime = event.value[0]?.utterance;
                context.time = recognizedtime;
                return (
                  recognizedtime &&
                  isInGrammar(recognizedtime) && 
                  grammar[recognizedtime.toLowerCase()].response === 'time'
                );
                },
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not a time in the grammar, please try again with a time number from 1 to 24`,
                },
              }),
              target: "FifthQuestion",
              }
            ],
          },
        },
        SixthQuestion:{
          entry:({ context }) =>
            context.ssRef.send({
            type: "SPEAK",
            params: `Do you want to create an appointment with ${context.name} 
            on ${context.day} at ${context.time}?`,
          }),
          on: { SPEAK_COMPLETE: "LastListen" },
        },
        LastQuestion:{
          entry:({ context }) =>
          context.ssRef.send({
          type: "SPEAK",
            params: `Do you want to create an appointment with ${context.name} 
            on ${context.day} for the whole day?`,
          }),
          on: { SPEAK_COMPLETE: "LastListen" },
        },
        LastListen:{
          entry: ({ context }) =>
          context.ssRef.send({
            type: "LISTEN", value:{completeTimeout: 5}
          }),
          on:{
            RECOGNISED: [
              {target: "Done",
              guard: ({ event }) => 
                {const recognizedUtterance = event.value[0]?.utterance;
                return (
                  recognizedUtterance &&
                  isInGrammar(recognizedUtterance) && 
                  grammar[recognizedUtterance.toLowerCase()].response === 'positive'
                );
                },
              },
              {target: "FirstQuestion",
              guard: ({ event }) => 
                {const recognizedUtterance = event.value[0]?.utterance;
                return (
                  recognizedUtterance &&
                  isInGrammar(recognizedUtterance) && 
                  grammar[recognizedUtterance.toLowerCase()].response === 'negative'
                );
                },
              actions: {
                type: "Say",
                params: `I see. Let's do it over again.`,
              },
              },
              {actions: ({ context, event }) =>
              context.ssRef.send({
                type: "SPEAK",
                value: {
                  utterance: `You just said: ${
                    event.value[0].utterance
                  }. And it is not an expected answer in the grammar, please try again with yes or no.`,
                },
              }),
              target: "FifthQuestion",
              }
            ],
          },
        },
        Done: {
          entry:[{
            type: "Say",
            params: `Your appointment has been created!`,
          }],
          on: { CLICK: "#DM.PromptAndAsk"},
        },
      },
    },
  },
});


const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  /* if you want to log some parts of the state */
});

export function setupButton(element) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.getSnapshot().context.ssRef.subscribe((snapshot) => {
    element.innerHTML = `${snapshot.value.AsrTtsManager.Ready}`;
  });
}
