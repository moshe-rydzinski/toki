import test from "node:test";
import assert from "node:assert/strict";

import { collectUserActivity, computeLeaderboard, joinQuestionsWithAnswersAndRatings } from "../domain.js";

const profiles = [
  { id: "u1", username: "ava", full_name: "Ava" },
  { id: "u2", username: "leo", full_name: "Leo" },
  { id: "u3", username: "maya", full_name: "Maya" },
];

const questions = [
  { id: "q1", asker_id: "u1", title: "Question 1", body: "Body 1", created_at: "2026-01-01T10:00:00Z" },
  { id: "q2", asker_id: "u3", title: "Question 2", body: "Body 2", created_at: "2026-01-03T10:00:00Z" },
];

const answers = [
  { id: "a1", question_id: "q1", giver_id: "u2", body: "Answer 1", created_at: "2026-01-02T10:00:00Z" },
  { id: "a2", question_id: "q1", giver_id: "u3", body: "Answer 2", created_at: "2026-01-01T11:00:00Z" },
  { id: "a3", question_id: "q2", giver_id: "u1", body: "Answer 3", created_at: "2026-01-03T12:00:00Z" },
];

const ratings = [
  { id: "r1", answer_id: "a1", asker_id: "u1", score: 9, created_at: "2026-01-02T11:00:00Z" },
  { id: "r2", answer_id: "a2", asker_id: "u1", score: 7, created_at: "2026-01-02T11:30:00Z" },
];

test("joinQuestionsWithAnswersAndRatings attaches ratings and sorts", () => {
  const joined = joinQuestionsWithAnswersAndRatings(questions, answers, ratings);

  assert.equal(joined[0].id, "q2");
  assert.equal(joined[1].id, "q1");
  assert.equal(joined[1].answers[0].id, "a2");
  assert.equal(joined[1].answers[1].id, "a1");
  assert.equal(joined[1].answers[0].rating, 7);
  assert.equal(joined[1].answers[1].rating, 9);
  assert.equal(joined[0].answers[0].rating, null);
});

test("computeLeaderboard ranks users with rated answers only", () => {
  const joined = joinQuestionsWithAnswersAndRatings(questions, answers, ratings);
  const leaderboard = computeLeaderboard(profiles, joined);

  assert.equal(leaderboard.length, 2);
  assert.equal(leaderboard[0].profile.id, "u2");
  assert.equal(leaderboard[0].avg, 9);
  assert.equal(leaderboard[1].profile.id, "u3");
  assert.equal(leaderboard[1].avg, 7);
});

test("collectUserActivity returns question and answer history for a user", () => {
  const joined = joinQuestionsWithAnswersAndRatings(questions, answers, ratings);
  const activity = collectUserActivity("u1", joined);

  assert.equal(activity.myQuestions.length, 1);
  assert.equal(activity.myQuestions[0].id, "q1");
  assert.equal(activity.myAnswers.length, 1);
  assert.equal(activity.myAnswers[0].answer.id, "a3");
});
