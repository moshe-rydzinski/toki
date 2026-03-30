export function joinQuestionsWithAnswersAndRatings(questions, answers, ratings) {
  const ratingsByAnswerId = new Map(ratings.map((rating) => [rating.answer_id, rating]));
  const answersByQuestionId = new Map();

  for (const answer of answers) {
    const withRating = {
      ...answer,
      rating: ratingsByAnswerId.get(answer.id)?.score ?? null,
    };

    if (!answersByQuestionId.has(answer.question_id)) {
      answersByQuestionId.set(answer.question_id, []);
    }
    answersByQuestionId.get(answer.question_id).push(withRating);
  }

  return questions
    .map((question) => ({
      ...question,
      answers: [...(answersByQuestionId.get(question.id) ?? [])].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      ),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function computeLeaderboard(profiles, questionsWithAnswers) {
  const ratingsByUserId = new Map();

  for (const profile of profiles) {
    ratingsByUserId.set(profile.id, []);
  }

  for (const question of questionsWithAnswers) {
    for (const answer of question.answers ?? []) {
      if (answer.rating == null) {
        continue;
      }
      if (!ratingsByUserId.has(answer.giver_id)) {
        ratingsByUserId.set(answer.giver_id, []);
      }
      ratingsByUserId.get(answer.giver_id).push(answer.rating);
    }
  }

  return profiles
    .map((profile) => {
      const ratings = ratingsByUserId.get(profile.id) ?? [];
      const count = ratings.length;
      const avg = count === 0 ? 0 : ratings.reduce((sum, score) => sum + score, 0) / count;
      const score = count === 0 ? 0 : avg * Math.log10(count + 1.3);
      return { profile, count, avg, score };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.avg !== a.avg) {
        return b.avg - a.avg;
      }
      return b.count - a.count;
    });
}

export function collectUserActivity(userId, questionsWithAnswers) {
  const myQuestions = questionsWithAnswers.filter((question) => question.asker_id === userId);
  const myAnswers = [];

  for (const question of questionsWithAnswers) {
    for (const answer of question.answers ?? []) {
      if (answer.giver_id === userId) {
        myAnswers.push({ question, answer });
      }
    }
  }

  return { myQuestions, myAnswers };
}
