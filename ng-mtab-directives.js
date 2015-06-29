"use strict";

(function (angular) {

    var module = angular.module("educ.ngMtabDirectives", []);

    module.directive("opdQcm", function () {
        return {
            templateUrl: "mtab/opd/qcm.html",
            replace: true,
            restrict: 'A',
            scope: {
                qcm: '=opd', // attribut data-opd="" (qcmOpdModel)
                onAnswer: "=", // attribut data-on-answer="" (function)
                showDebug: "=", // attribut data-debug=""
                showQuestion: "=", // attribut data-on-question="" (true/false)
                showAnswers: "=", // attribut data-on-answers="" (true/false)
                showExplain: "=", // attribut data-on-explain="" (true/false)
                highlightIndex: "=", // attribut data-highlight-index="" (qcm.answers[*].indexInOpd)
                answerIndex: "=", // attribut data-answer-index="" (qcm.answers[*].indexInOpd)
                answerScore: "=", // attribut data-answer-score=""
                commentHtml: "=" // attribut data-comment-html=""
            },
            link: function ($scope, $element) {
    
                function updateWithAnswer(value) {
                    if (value !== null && !isNaN(value)) {
                        $scope.withAnswer = true;
                    } else {
                        $scope.withAnswer = false;
                    }
                }
    
                function updateScoreHtml(value) {
                    if (value !== null && !isNaN(value)) {
                        value = parseFloat(value);
                        if (value == parseInt(value)) {
                            value = parseInt(value);
                        }
                        var scoreHtml = [];
                        scoreHtml.push(value > 0 ? "+" + value : value);
                        scoreHtml.push(Math.abs(value) > 1 ? "pts" : "pt");
                        $scope.scoreHtml = scoreHtml.join("&nbsp;");
                    } else {
                        delete $scope.scoreHtml;
                    }
                }
    
                $scope.$watch("answerIndex", updateWithAnswer);
    
                $scope.$watch("answerScore", updateScoreHtml);
            }
        };
    });
    
    module.run(["$templateCache", function ($templateCache) {
        $templateCache.put('mtab/opd/qcm.html', "" +
            '<div class="opd opd-qcm" data-ng-class="{\'with-answer\':withAnswer}" data-opd-id="qcm.opdId">' +
                '<div data-ng-if="showDebug">' +
                    'showQuestion:{{showQuestion|json}}<br>' +
                    'showAnswers:{{showAnswers|json}}<br>' +
                    'showExplain:{{showExplain|json}}<br>' +
                    'withAnswer:{{withAnswer|json}}<br>' +
                    'answerIndex:{{answerIndex|json}}<br>' +
                    'answerScore:{{answerScore|json}}<br>' +
                    'commentHtml:{{commentHtml|json}}<br>' +
                    'scoreHtml:{{scoreHtml|json}}' +
                '</div>' +
                '<div data-ng-if="showQuestion">' +
                    '<div class="question text-center" data-ng-html="qcm.question.html"></div>' +
                '</div>' +
                '<div class="answers" data-ng-if="showAnswers">' +
                    '<ul class="propositions">' +
                        '<li data-ng-repeat="answer in qcm.answers"class="answer" data-ng-class="{\'answer-highlight\':answer.indexInOpd===highlightIndex, \'answer-true\':withAnswer&&answer.isJuste, \'answer-false\':withAnswer&&!answer.isJuste, \'answer-clicked\':withAnswer&&answer.indexInOpd===answerIndex}" data-ng-click="onAnswer(answer)">' +
                            '<span class="pull-right answer-comment-container" data-ng-if="(scoreHtml || commentHtml) && withAnswer&&answer.indexInOpd===answerIndex">' +
                                '<span data-ng-if="scoreHtml" class="badge" data-ng-class="answer.isJuste ? \'badge-win\': \'badge-loose\'">' +
                                    '<i class="fa" data-ng-class="answer.isJuste ? \'fa-smile-o\' : \'fa-frown-o\'"></i>' +
                                    '<span data-ng-html="scoreHtml"></span>' +
                                '</span>' +
                                '<span class="answer-comment" data-ng-html="commentHtml"></span>' +
                            '</span>' +
                            '<span data-ng-html="answer.html"></span>' +
                        '</li>' +
                    '</ul>' +
                '</div>' +
                '<div class="explain" data-ng-if="showExplain">' +
                    '<h3>Rappel de cours</h3>' +
                    '<div data-ng-html="qcm.explain.html"></div>' +
                '</div>' +
            '</div>'
        );
    }]);

})(angular);
