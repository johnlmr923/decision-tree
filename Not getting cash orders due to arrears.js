// decision_trees/Not_getting_cash_orders_due_to_arrears.js

// Function to display decision tree for Not getting cash orders due to arrears
function showDecisionTreeForCashOrdersDueToArrears() {
    const decisionTreeMessage = "Is the NO CASH ORDERS DUE TO ARREARS TAG (byoc_cash_disabled) applied on the Restaurant Partner's account on WOK?<br>" +
        "<button class='btn' onclick='showSecondQuestionForCashOrdersDueToArrears(true)'>Yes</button>" +
        "<button class='btn' onclick='showSecondQuestionForCashOrdersDueToArrears(false)'>No</button>";
    showMessage(decisionTreeMessage);
}

// Function to display second question for cash orders due to arrears
function showSecondQuestionForCashOrdersDueToArrears(tagApplied) {
    let question, yesAction, noAction;
    if (tagApplied) {
        question = "In case restaurants are in arrears they will temporarily lose access to cash. The only way to get out of arrears is wait until they have enough credit card orders to offset their negative balance. Submit contact as resolved with SR Explain - BYOC Restaurant partner in arrears.";
        showMessage(question);
    } else {
        question = "Is the byoc_cash_disabled_exempt applied on the Restaurant Partner's profile in WOK?<br>" +
            "<button class='btn' onclick='showThirdQuestionForCashOrdersDueToArrears(false)'>Yes</button>" +
            "<button class='btn' onclick='showThirdQuestionForCashOrdersDueToArrears(true)'>No</button>";
        showMessage(question);
    }
}

// Function to display third question for cash orders due to arrears
function showThirdQuestionForCashOrdersDueToArrears(exemptApplied) {
    const question = "The restaurant partner is eligible for cash and should receive cash trips. Submit contact as resolved with SR Confirm - BYOC Restaurant able to receive cash. And then escalate to AM.";
    showMessage(question);
}

// Function to display message on the page
function showMessage(message) {
    const messageContainer = document.getElementById("messageContainer");
    messageContainer.innerHTML = message;
}

// Call the main function to display the decision tree
showDecisionTreeForCashOrdersDueToArrears();
