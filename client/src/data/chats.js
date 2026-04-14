export const chats = [
  {
    id: 1,
    name: "Regie Ford",
    time: "10:32 AM",
    lastMessage: "Let's finalize the dashboard UI today.",
    status: "online",
    messages: [
      {
        id: 1,
        text: "Hello, how are you?",
        type: "received",
        time: "10:15 AM",
      },
      {
        id: 2,
        text: "I am good. Working on the WhatsApp-style interface.",
        type: "sent",
        time: "10:16 AM",
      },
      {
        id: 3,
        text: "Good. Make it close to WhatsApp Web.",
        type: "received",
        time: "10:17 AM",
      },
    ],
  },
  {
    id: 2,
    name: "Brenda Jackson",
    time: "09:45 AM",
    lastMessage: "Can we update the lead form next?",
    status: "last seen today at 9:50 AM",
    messages: [
      {
        id: 1,
        text: "Can we update the lead form next?",
        type: "received",
        time: "09:45 AM",
      },
      {
        id: 2,
        text: "Yes, after I complete this UI shell.",
        type: "sent",
        time: "09:47 AM",
      },
    ],
  },
  {
    id: 3,
    name: "Support Team",
    time: "Yesterday",
    lastMessage: "The build has been deployed successfully.",
    status: "last seen yesterday",
    messages: [
      {
        id: 1,
        text: "The build has been deployed successfully.",
        type: "received",
        time: "6:20 PM",
      },
      {
        id: 2,
        text: "Perfect. I will review it now.",
        type: "sent",
        time: "6:25 PM",
      },
    ],
  },
];