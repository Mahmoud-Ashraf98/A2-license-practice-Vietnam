// Separate teaching material. Never changes the official bank or strict papers.
export const breakdowns = {
  q362: [
    { role: "Task", vi: "Biển nào", en: "Which sign" },
    {
      role: "Action",
      vi: "báo hiệu hạn chế tốc độ",
      en: "indicates a speed restriction",
    },
    { role: "Vehicle", vi: "của phương tiện", en: "for the vehicle" },
    { role: "Limit", vi: "không vượt quá", en: "must not exceed" },
    {
      role: "Value",
      vi: "trị số ghi trên biển",
      en: "the value shown on the sign",
    },
  ],
  q487: [
    {
      role: "Situation",
      vi: "Theo hướng mũi tên",
      en: "Following the directions of the arrows",
    },
    {
      role: "Task",
      vi: "thứ tự các xe đi",
      en: "the order in which the vehicles proceed",
    },
    {
      role: "Rule",
      vi: "như thế nào là đúng quy tắc giao thông",
      en: "which order complies with the traffic rules",
    },
  ],
};

export const junction487 = [
  [
    "Xe tải",
    "Truck",
    "The truck and motorcycle approach on the priority road. The truck goes straight; the motorcycle turns left across its path, so the truck goes first.",
  ],
  [
    "Xe mô tô",
    "Motorcycle",
    "The motorcycle is also on the priority road. After yielding to the oncoming truck, it proceeds before the vehicles facing yield signs.",
  ],
  [
    "Xe khách",
    "Bus",
    "The bus and car have yield signs. Once the priority road is clear, the bus goes straight before the opposing car turns left.",
  ],
  [
    "Xe con",
    "Car",
    "The car yields to the priority-road vehicles and then to the oncoming bus before making its left turn.",
  ],
];

export const repairPrompts = {
  vocabulary:
    "Recall the chunk, read it in this sentence, then return to the original question.",
  negation: "Notice how one negative changes what the question asks.",
  rule: "Name the vehicle and situation before applying the rule. Then check the source explanation.",
  signs:
    "Compare shape, border and symbol before reading the number or selecting an answer.",
  diagram:
    "Find the controlling signs, then follow each vehicle’s arrow. Vehicle size does not decide priority.",
  numbers:
    "Attach every limit to its vehicle, road and conditions before comparing the options.",
  attention:
    "Understand the meaning first, then try three questions with a gentle three-minute clock.",
  unknown:
    "Start with the sentence meaning. You can change the difficulty after another look.",
};
