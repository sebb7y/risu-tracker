export interface HelloTalkConfig {
  calls: {
    connectedStatuses: string[];
    immersionPercent: number;
  };
  messages: {
    targetLanguageFilter: boolean;
    minimumCharacters: number;
    immersionPercent: number;
    excludeSystemMessages: boolean;
  };
  reading: {
    charactersPerHour: number;
  };
  writing: {
    charactersPerHour: number;
    estimateAutomatically: boolean;
  };
}

export const DEFAULT_HELLO_TALK_CONFIG: HelloTalkConfig = {
  calls: { connectedStatuses: ['99'], immersionPercent: 60 },
  messages: {
    targetLanguageFilter: true,
    minimumCharacters: 3,
    immersionPercent: 95,
    excludeSystemMessages: true,
  },
  reading: { charactersPerHour: 15000 },
  writing: { charactersPerHour: 9000, estimateAutomatically: false },
};
