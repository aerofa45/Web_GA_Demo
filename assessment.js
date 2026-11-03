'use strict';
// Strict boundary for untrusted model-generated assessment content.
function validateAssessments(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected assessment object.');
 const assignments=input.assignments,quizzes=input.quizzes;
 if(!Array.isArray(assignments)||!Array.isArray(quizzes)||assignments.length>4||quizzes.length>4||assignments.length+quizzes.length===0)throw Error('Expected one to eight assessments.');
 const str=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim():null;
 const normalizedAssignments=assignments.map(x=>{
  if(!x||typeof x!=='object'||!str(x.title,140)||!str(x.instructions,10000))throw Error('Invalid assignment.');
  return {title:str(x.title,140),instructions:str(x.instructions,10000),maxPoints:100,weight:1};
 });
 const normalizedQuizzes=quizzes.map(x=>{
  if(!x||typeof x!=='object'||!str(x.title,140)||!Array.isArray(x.questions)||x.questions.length<1||x.questions.length>10)throw Error('Invalid quiz.');
  const questions=x.questions.map(q=>{
   if(!q||!str(q.prompt,1000)||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>!str(o,500))||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length)throw Error('Invalid question.');
   return {prompt:str(q.prompt,1000),options:q.options.map(o=>str(o,500)),correct:q.correct};
  });
  return {title:str(x.title,140),questions,maxAttempts:1};
 });
 return {assignments:normalizedAssignments,quizzes:normalizedQuizzes};
}
module.exports={validateAssessments};
